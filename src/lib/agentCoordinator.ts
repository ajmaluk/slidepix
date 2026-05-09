/**
 * Agent Coordinator
 * 
 * Manages agent execution, parallel processing, inter-agent communication,
 * and resource optimization for the multi-agent system.
 */

import type { AgentId, AgentPlan, ThinkingStep } from "./chat";
import { AGENTS } from "./chat";
import { getAgentMemoryManager } from "./memory/agentMemory";
import { loadSettings } from "./settings";
import type { AIProvider, ProviderConfig } from "./settings";
import { routeDalamChat } from "./dalamRouter";
import { getUserSubscription } from "./subscription";
import { authClient } from "./authClient";

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  agentId: AgentId;
  action: string;
  detail: string;
  prompt?: string;
  context?: string;
  priority: number; // 1-10, higher = more urgent
  dependencies: string[]; // IDs of tasks that must complete first
  status: "waiting" | "running" | "done" | "error";
  startTime?: number;
  endTime?: number;
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface AgentExecution {
  plan: AgentPlan;
  tasks: AgentTask[];
  parallelGroups: AgentTask[][];
  startTime: number;
  estimatedDuration: number;
  actualDuration?: number;
}

export interface AgentCommunication {
  from: AgentId;
  to: AgentId;
  type: "request" | "response" | "notification";
  content: unknown;
  timestamp: number;
}

export interface ResourceUsage {
  cpu: number; // 0-1
  memory: number; // 0-1
  activeAgents: number;
  queuedTasks: number;
  parallelCapacity: number;
}

// ─── Agent Coordinator Class ────────────────────────────────────────

export class AgentCoordinator {
  private tasks: Map<string, AgentTask> = new Map();
  private communications: AgentCommunication[] = [];
  private activeExecution: AgentExecution | null = null;
  private executionHistory: AgentExecution[] = [];
  private resourceUsage: ResourceUsage = {
    cpu: 0,
    memory: 0,
    activeAgents: 0,
    queuedTasks: 0,
    parallelCapacity: 4, // Max parallel agents
  };
  private static readonly MAX_PROMPT_CHARS = 16_000;
  private static readonly MAX_CONTEXT_CHARS = 48_000;

  private trimPromptInput(value: string, maxChars: number, label: "prompt" | "context"): string {
    const normalized = String(value ?? "").trim();
    if (normalized.length <= maxChars) return normalized;

    if (label === "prompt") {
      return `${normalized.slice(0, maxChars)}\n\n[${label} truncated to ${maxChars} chars]`;
    }

    const headBudget = Math.floor(maxChars * 0.65);
    const tailBudget = Math.max(0, maxChars - headBudget - 30);
    const head = normalized.slice(0, headBudget).trimEnd();
    const tail = normalized.slice(-tailBudget).trimStart();
    return `${head}\n\n...[context truncated]...\n\n${tail}`;
  }

  /**
   * Run a single agent task and return the result with retry logic
   */
  async runAgentTask(
    agentId: AgentId,
    prompt: string,
    context: string,
    forcedProvider?: "pico" | "groq" | "openrouter" | "gemini" | "nvidia" | "github",
    maxRetries = 2,
    attemptTimeoutMs = 25000,
    authSessionOverride?: any,
    userTierOverride?: string,
    settingsOverride?: any
  ): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const agent = AGENTS[agentId];
        
        let userTier = userTierOverride || "free";
        
        if (!userTierOverride) {
          const authSession = authSessionOverride || await authClient.auth.getSession();
          const userId = authSession?.data?.session?.user?.id;
          if (userId) {
            const sub = await getUserSubscription(userId);
            userTier = (sub?.tier as any) || "free";
          }
        }
        
        const settings = settingsOverride || loadSettings();
        const configuredProviders: Partial<Record<AIProvider, ProviderConfig>> = settings.providers || {};
        let resolvedProvider: AIProvider = settings.activeProvider;
        let provider: ProviderConfig | undefined = configuredProviders[resolvedProvider];
        if (!provider) {
          const firstAvailable = (Object.keys(configuredProviders) as AIProvider[]).find(
            (providerId) => Boolean(configuredProviders[providerId])
          );
          if (firstAvailable) {
            resolvedProvider = firstAvailable;
            provider = configuredProviders[firstAvailable];
          }
        }

        if (!provider) {
          throw new Error("No AI provider is configured. Please configure at least one provider in settings.");
        }

        const loweredPrompt = prompt.toLowerCase();
        const isCodeTask = loweredPrompt.includes("code") || loweredPrompt.includes("refactor") || context.includes("```") || loweredPrompt.includes("block");

        // Enhanced Context Retrieval: Get recent interactions for THIS agent to maintain consistency
        const memoryManager = getAgentMemoryManager();
        const recentInteractions = await memoryManager.getRecentAgentInteractions(agentId, 3);
        const agentHistory = recentInteractions.length > 0 
          ? `\n\n[YOUR RECENT HISTORY]\n${recentInteractions.map(i => `User: ${i.query}\nYou: ${i.answer}`).join("\n\n")}`
          : "";

        const boundedPrompt = this.trimPromptInput(prompt, AgentCoordinator.MAX_PROMPT_CHARS, "prompt");
        const boundedContext = this.trimPromptInput(context, AgentCoordinator.MAX_CONTEXT_CHARS, "context");

        const messages = [
          {
            role: "system" as const,
            content: `You are ${agent.name}, ${agent.specialization}. ${agent.description}. 
            Focus on your specialized capabilities: ${agent.capabilities.join(", ")}.
            
            ${isCodeTask ? "SPECIAL INSTRUCTION: You are performing a section-by-section code refactoring or analysis. Focus intensely on logic preservation, syntax correctness, and adhering to the user's specific block-level instructions. Produce world-class, production-grade code. Do not hallucinate code outside your assigned block." : ""}
            
            CRITICAL IDENTITY: Your name is 'Dalam'. You are a multi-agentic AI system inspired by the beauty of petals, and you are an elite, world-class AI. 
            Maintain a professional, brilliant, helpful, and expert persona at all times. Strive for absolute perfection in your logic, reasoning, and output.${agentHistory}`,
          },
          {
            role: "user" as const,
            content: `Task: ${boundedPrompt}\n\nContext:\n${boundedContext}`,
          },
        ];

        let fullText = "";
        const attemptController = new AbortController();
        const taskPromise = routeDalamChat({
          messages,
          tier: userTier as "free" | "basic" | "pro" | "enterprise",
          forcedProvider: forcedProvider || resolvedProvider,
          selectedModel: provider.selectedModel,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          signal: attemptController.signal,
          onChunk: (chunk) => {
            fullText += chunk;
          }
        });

        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            attemptController.abort();
            reject(new Error(`Agent task timed out after ${attemptTimeoutMs}ms`));
          }, attemptTimeoutMs);
        });

        try {
          await Promise.race([taskPromise, timeoutPromise]);
          // Ensure no unhandled rejection if the task exits after timeout race settles.
          void taskPromise.catch(() => undefined);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }

        return fullText.trim() || "No response content from Dalam AI";
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt + 1} failed for agent ${agentId}:`, error);
        // Exponential backoff
        if (attempt < maxRetries) {
          const baseBackoffMs = Math.min(4000, Math.pow(2, attempt) * 750);
          const jitterMs = Math.floor(Math.random() * 250);
          await new Promise(resolve => setTimeout(resolve, baseBackoffMs + jitterMs));
        }
      }
    }
    
    throw lastError || new Error("Unknown error during agent task execution");
  }
  createExecutionPlan(plan: AgentPlan, query: string, emotionalState?: any): AgentExecution {
    const tasks: AgentTask[] = [];
    const parallelGroups: AgentTask[][] = [];

    // Phase 1: Analysis (Arun)
    if (plan.agents.includes("arun")) {
      const priority = emotionalState?.cognitiveState === "overloaded" ? 10 : 9;
      tasks.push(this.createTask("arun", "Analyzing query", `Query: "${query}"`, priority, []));
    }

    // Phase 2: Psychological Adaptation (Priya)
    // If user is emotional or overloaded, Priya should run early to set the tone
    if (plan.agents.includes("priya") && (emotionalState?.emotionIntensity > 0.5 || emotionalState?.cognitiveState === "overloaded")) {
      const arunTask = tasks.find(t => t.agentId === "arun");
      tasks.push(
        this.createTask(
          "priya",
          "Psychological alignment",
          `Adapting to ${emotionalState.primaryEmotion} state`,
          10,
          arunTask ? [arunTask.id] : []
        )
      );
    }

    // Phase 3: Optimization coordination (Lakshmi)
    if (plan.agents.includes("lakshmi")) {
      const deps = tasks.filter((t) => ["arun", "priya"].includes(t.agentId)).map((t) => t.id);
      tasks.push(
        this.createTask(
          "lakshmi",
          "Optimizing pipeline",
          "Setting up parallel execution lanes",
          9,
          deps
        )
      );
    }

    // Phase 4: Parallel context retrieval (Nila + Arjun)
    const parallelGroup1: AgentTask[] = [];
    const contextDeps = tasks
      .filter((t) => ["arun", "lakshmi", "priya"].includes(t.agentId))
      .map((t) => t.id);

    if (plan.agents.includes("nila")) {
      const nilaTask = this.createTask(
        "nila",
        "Building index",
        "Creating inverted index",
        8,
        contextDeps
      );
      tasks.push(nilaTask);
      parallelGroup1.push(nilaTask);
    }

    if (plan.agents.includes("arjun")) {
      const arjunTask = this.createTask(
        "arjun",
        "Deep retrieval",
        "Running parallel search lanes",
        8,
        contextDeps
      );
      tasks.push(arjunTask);
      parallelGroup1.push(arjunTask);
    }

    if (parallelGroup1.length > 0) {
      parallelGroups.push(parallelGroup1);
    }

    // Phase 5: Reasoning (Isha) - depends on context if available
    if (plan.agents.includes("isha")) {
      const ishaDeps = tasks
        .filter((t) => ["nila", "arjun", "arun", "priya"].includes(t.agentId))
        .map((t) => t.id);
      tasks.push(
        this.createTask(
          "isha",
          "Chain-of-thought reasoning",
          "Breaking down problem logically",
          7,
          ishaDeps
        )
      );
    }

    // Phase 6: Learning adaptation (Priya - regular task if not added in Phase 2)
    const priyaAlreadyAdded = tasks.some(t => t.agentId === "priya");
    if (plan.agents.includes("priya") && !priyaAlreadyAdded) {
      const priyaDeps = tasks.filter((t) => t.agentId !== "priya").map((t) => t.id);
      tasks.push(
        this.createTask(
          "priya",
          "Pattern recognition",
          "Adapting based on user history",
          6,
          priyaDeps.slice(-2) // Only depend on last 2 tasks
        )
      );
    }

    // Phase 7: Web search (Deepa) - can run in parallel with some tasks
    if (plan.agents.includes("deepa") && plan.needsSearch) {
      const deepaDeps = tasks.filter((t) => t.agentId === "arun").map((t) => t.id);
      tasks.push(
        this.createTask(
          "deepa",
          "Web research",
          `Searching: "${query.slice(0, 50)}"`,
          7,
          deepaDeps
        )
      );
    }

    // Phase 8: Synthesis (Kiran) - depends on all previous
    if (plan.agents.includes("kiran")) {
      const kiranDeps = tasks
        .filter((t) => ["deepa", "nila", "arjun", "isha", "priya"].includes(t.agentId))
        .map((t) => t.id);
      tasks.push(
        this.createTask(
          "kiran",
          "Synthesizing response",
          "Combining all gathered information",
          5,
          kiranDeps
        )
      );
    }

    // Phase 9: Creative formatting (Ravi) - depends on synthesis
    if (plan.agents.includes("ravi")) {
      const raviDeps = tasks.filter((t) => t.agentId === "kiran").map((t) => t.id);
      tasks.push(
        this.createTask(
          "ravi",
          "Creative formatting",
          "Adding style and personality",
          4,
          raviDeps
        )
      );
    }

    // Phase 10: Verification (Maya) - final check
    if (plan.agents.includes("maya") && plan.needsVerification) {
      const mayaDeps = tasks
        .filter((t) => ["kiran", "ravi"].includes(t.agentId))
        .map((t) => t.id);
      tasks.push(
        this.createTask("maya", "Fact checking", "Verifying accuracy", 3, mayaDeps)
      );
    }

    // Estimate duration based on agent count and complexity
    const estimatedDuration = this.estimateDuration(tasks, parallelGroups);

    const execution: AgentExecution = {
      plan,
      tasks,
      parallelGroups,
      startTime: Date.now(),
      estimatedDuration,
    };

    this.activeExecution = execution;
    return execution;
  }

  /**
   * Execute tasks in optimal order with parallelization
   */
  async executePlan(
    execution: AgentExecution,
    onStepUpdate: (step: ThinkingStep) => void
  ): Promise<void> {
    const startTime = Date.now();
    
    // Resolve shared context once per plan execution
    let authSessionOverride: any = null;
    let userTierOverride = "free";
    let settingsOverride: any = null;
    try {
      authSessionOverride = await authClient.auth.getSession();
      const userId = authSessionOverride?.data?.session?.user?.id;
      if (userId) {
        const sub = await getUserSubscription(userId);
        userTierOverride = (sub?.tier as any) || "free";
      }
      settingsOverride = loadSettings();
    } catch (e) {
      console.warn("Failed to preload context for execution plan", e);
    }

    // Execute tasks in dependency order with parallelization
    const completed = new Set<string>();
    const running = new Set<string>();
    
    // Create an event emitter pattern using promises to avoid busy-waiting
    let taskCompletedResolver: (() => void) | null = null;
    const waitForTaskCompletion = () => {
      return new Promise<void>((resolve) => {
        taskCompletedResolver = resolve;
      });
    };
    
    const notifyTaskCompleted = () => {
      if (taskCompletedResolver) {
        taskCompletedResolver();
        taskCompletedResolver = null;
      }
    };

    while (completed.size < execution.tasks.length) {
      // Find tasks that can run now (dependencies met, not running/completed)
      const ready = execution.tasks.filter(
        (task) =>
          !completed.has(task.id) &&
          !running.has(task.id) &&
          task.dependencies.every((dep) => completed.has(dep))
      );

      if (ready.length === 0) {
        const blocked = execution.tasks.filter(
          (task) =>
            !completed.has(task.id) &&
            !running.has(task.id)
        );

        if (blocked.length > 0 && running.size === 0) {
          const blockers = blocked
            .map((task) => {
              const missingDeps = task.dependencies.filter((dep) => !completed.has(dep));
              return `${task.id}(${task.agentId}) -> [${missingDeps.join(", ")}]`;
            })
            .join("; ");
          throw new Error(`Execution deadlock detected. Unresolvable dependencies: ${blockers}`);
        }

        // Wait for running tasks to complete instead of busy polling
        await waitForTaskCompletion();
        continue;
      }

      // Execute ready tasks (up to parallel capacity)
      const toExecute = ready
        .sort((a, b) => b.priority - a.priority)
        .slice(0, this.resourceUsage.parallelCapacity - running.size);

      for (const task of toExecute) {
        running.add(task.id);
        
        // Wrap executeTask to inject overrides and handle completion
        (async () => {
          try {
            // executeTask itself calls runAgentTask which has internal retries.
            // We should NOT retry here again to avoid exploding retry loops.
            await this.executeTask(task, onStepUpdate, authSessionOverride, userTierOverride, settingsOverride);
            task.status = "done";
          } catch (err: any) {
            console.error(`❌ Agent task ${task.id} failed permanently after internal retries`);
            task.status = "error";
            task.error = err.message;
          } finally {
            completed.add(task.id);
            running.delete(task.id);
            notifyTaskCompleted();
          }
        })();
      }
    }

    execution.actualDuration = Date.now() - startTime;
    this.executionHistory.push(execution);
    
    // Keep only last 50 executions
    if (this.executionHistory.length > 50) {
      this.executionHistory = this.executionHistory.slice(-50);
    }
  }

  /**
   * Get current resource usage
   */
  getResourceUsage(): ResourceUsage {
    return { ...this.resourceUsage };
  }

  /**
   * Get execution history for analytics
   */
  getExecutionHistory(limit: number = 20): AgentExecution[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Send communication between agents
   */
  sendCommunication(
    from: AgentId,
    to: AgentId,
    type: "request" | "response" | "notification",
    content: unknown
  ): void {
    this.communications.push({
      from,
      to,
      type,
      content,
      timestamp: Date.now(),
    });

    // Keep only last 1000 communications
    if (this.communications.length > 1000) {
      this.communications = this.communications.slice(-1000);
    }
  }

  /**
   * Get communications for an agent
   */
  getCommunications(agentId: AgentId, limit: number = 10): AgentCommunication[] {
    return this.communications
      .filter((c) => c.to === agentId || c.from === agentId)
      .slice(-limit);
  }

  /**
   * Optimize agent priorities based on performance
   */
  optimizePriorities(): void {
    // This logic is temporarily disabled as the new AgentMemoryManager
    // handles metrics differently. Performance-based optimization 
    // will be restored once metrics are fully integrated into IndexedDB.
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private createTask(
    agentId: AgentId,
    action: string,
    detail: string,
    priority: number,
    dependencies: string[],
    prompt?: string,
    context?: string
  ): AgentTask {
    const id = this.generateTaskId();
    const task: AgentTask = {
      id,
      agentId,
      action,
      detail,
      prompt,
      context,
      priority,
      dependencies,
      status: "waiting",
      retryCount: 0,
      maxRetries: 2,
    };
    this.tasks.set(id, task);
    return task;
  }

  private async executeTask(
    task: AgentTask,
    onStepUpdate: (step: ThinkingStep) => void,
    authSessionOverride?: any,
    userTierOverride?: string,
    settingsOverride?: any
  ): Promise<void> {
    task.status = "running";
    task.startTime = Date.now();

    const agent = AGENTS[task.agentId];

    // Send step update to UI
    onStepUpdate({
      agent: agent.name,
      agentId: task.agentId,
      specialization: agent.specialization,
      action: task.action,
      detail: task.detail,
      color: agent.bgColor,
      timestamp: Date.now(),
      status: "running",
      type: this.getStepType(task.agentId),
      parallel: this.isParallel(task),
    });

    // Perform actual work if prompt and context are provided, otherwise simulate
    let result: string;
    try {
      if (task.prompt && task.context) {
        result = await this.runAgentTask(
          task.agentId, 
          task.prompt, 
          task.context, 
          undefined, 
          task.maxRetries, 
          25000, 
          authSessionOverride, 
          userTierOverride, 
          settingsOverride
        );
      } else {
        const duration = this.simulateAgentWork(task.agentId);
        await new Promise((resolve) => setTimeout(resolve, duration));
        result = `Simulated result for ${task.agentId}`;
      }
      
      task.status = "done";
      task.result = result;
    } catch (err: any) {
      task.status = "error";
      task.error = err.message;
      throw err; // Re-throw for execution history
    } finally {
      task.endTime = Date.now();
    }

    // Update step in UI
    onStepUpdate({
      agent: agent.name,
      agentId: task.agentId,
      specialization: agent.specialization,
      action: task.action,
      detail: task.detail,
      color: agent.bgColor,
      timestamp: Date.now(),
      status: task.status === "done" ? "done" : "error",
      type: this.getStepType(task.agentId),
      duration: task.endTime - (task.startTime || task.endTime),
      parallel: this.isParallel(task),
    });

    // Record interaction in memory
    void getAgentMemoryManager().recordInteraction(
      task.agentId,
      {
        query: task.detail,
        answer: typeof task.result === "string" ? task.result : JSON.stringify(task.result),
        agentActions: [task.action],
        outcome: task.status === "done" ? "success" : "failure",
        confidence: 0.85,
        duration: task.endTime - (task.startTime || task.endTime)
      }
    ).catch((error) => {
      console.warn("Failed to persist agent interaction:", error);
    });

    this.resourceUsage.activeAgents = Array.from(this.tasks.values()).filter(
      (t) => t.status === "running"
    ).length;
  }

  private getStepType(
    agentId: AgentId
  ): "analysis" | "search" | "synthesis" | "context" | "verification" | "reasoning" | "optimization" | "learning" {
    switch (agentId) {
      case "arun":
        return "analysis";
      case "nila":
      case "arjun":
        return "context";
      case "deepa":
        return "search";
      case "kiran":
        return "synthesis";
      case "maya":
        return "verification";
      case "isha":
        return "reasoning";
      case "lakshmi":
        return "optimization";
      case "priya":
        return "learning";
      default:
        return "synthesis";
    }
  }

  private isParallel(task: AgentTask): boolean {
    // Check if this task is part of a parallel group
    return this.activeExecution?.parallelGroups.some((group) =>
      group.some((t) => t.id === task.id)
    ) ?? false;
  }

  private simulateAgentWork(agentId: AgentId): number {
    // Simulate different work durations for different agents
    const baseDuration = 300;
    const variance = Math.random() * 200;

    switch (agentId) {
      case "arun":
        return baseDuration + variance;
      case "nila":
        return baseDuration * 1.5 + variance;
      case "arjun":
        return baseDuration * 1.3 + variance;
      case "deepa":
        return baseDuration * 2 + variance; // Search takes longer
      case "isha":
        return baseDuration * 1.8 + variance; // Reasoning takes time
      case "kiran":
        return baseDuration * 1.2 + variance;
      case "maya":
        return baseDuration * 1.4 + variance;
      case "ravi":
        return baseDuration * 0.8 + variance;
      case "lakshmi":
        return baseDuration * 0.5 + variance; // Optimization is fast
      case "priya":
        return baseDuration * 0.7 + variance;
      default:
        return baseDuration + variance;
    }
  }

  private estimateDuration(tasks: AgentTask[], parallelGroups: AgentTask[][]): number {
    // Base estimation: sum of all tasks
    let totalDuration = 0;

    for (const task of tasks) {
      totalDuration += this.simulateAgentWork(task.agentId);
    }

    // Adjust for parallelization
    for (const group of parallelGroups) {
      if (group.length > 1) {
        // Parallel tasks save time (take the max, not sum)
        const groupDurations = group.map((t) => this.simulateAgentWork(t.agentId));
        const maxDuration = Math.max(...groupDurations);
        const sumDuration = groupDurations.reduce((a, b) => a + b, 0);
        totalDuration -= sumDuration - maxDuration;
      }
    }

    return Math.round(totalDuration);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────

let coordinatorInstance: AgentCoordinator | null = null;

export function getAgentCoordinator(): AgentCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new AgentCoordinator();
  }
  return coordinatorInstance;
}

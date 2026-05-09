/**
 * Advanced Agent Reasoning System
 * 
 * Features:
 * - Chain-of-thought reasoning
 * - Self-correction and error recovery
 * - Confidence calibration
 * - Multi-step problem decomposition
 * - Validation and verification
 */

import type { AgentId } from "./chat";

// ─── Types ───────────────────────────────────────────────────────────

export interface ReasoningStep {
  id: string;
  stepNumber: number;
  thought: string;
  action: string;
  observation: string | null;
  confidence: number;
  timestamp: number;
  validated: boolean;
  corrected: boolean;
  corrections?: string[];
}

export interface ReasoningChain {
  id: string;
  agentId: AgentId;
  query: string;
  steps: ReasoningStep[];
  conclusion: string | null;
  overallConfidence: number;
  validationPassed: boolean;
  corrections: number;
  startTime: number;
  endTime?: number;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  confidence: number;
}

export interface ErrorRecovery {
  errorType: string;
  originalAction: string;
  recoveryStrategy: string;
  recovered: boolean;
  attempts: number;
}

// ─── Reasoning Engine ────────────────────────────────────────────────

export class ReasoningEngine {
  private activeChains: Map<string, ReasoningChain> = new Map();
  private completedChains: ReasoningChain[] = [];
  private maxSteps: number = 10;
  private maxActiveChains: number = 200;

  /**
   * Start a new reasoning chain
   */
  startReasoning(agentId: AgentId, query: string): ReasoningChain {
    if (this.activeChains.size >= this.maxActiveChains) {
      const oldestChainId = this.activeChains.keys().next().value as string | undefined;
      if (oldestChainId) {
        this.activeChains.delete(oldestChainId);
      }
    }

    const chain: ReasoningChain = {
      id: this.generateId(),
      agentId,
      query,
      steps: [],
      conclusion: null,
      overallConfidence: 0,
      validationPassed: false,
      corrections: 0,
      startTime: Date.now(),
    };

    this.activeChains.set(chain.id, chain);
    return chain;
  }

  /**
   * Add a reasoning step to the chain
   */
  addStep(
    chainId: string,
    thought: string,
    action: string,
    observation: string | null,
    confidence: number
  ): ReasoningStep | null {
    const chain = this.activeChains.get(chainId);
    if (!chain) return null;
    if (chain.steps.length >= this.maxSteps) return null;

    const step: ReasoningStep = {
      id: this.generateId(),
      stepNumber: chain.steps.length + 1,
      thought,
      action,
      observation,
      confidence,
      timestamp: Date.now(),
      validated: false,
      corrected: false,
    };

    chain.steps.push(step);
    return step;
  }

  /**
   * Validate a reasoning step and apply self-correction if needed
   */
  async validateStep(
    chainId: string,
    stepId: string
  ): Promise<ValidationResult> {
    const chain = this.activeChains.get(chainId) || this.completedChains.find(c => c.id === chainId);
    if (!chain) {
      return {
        isValid: false,
        issues: ["Chain not found"],
        suggestions: [],
        confidence: 0,
      };
    }

    const step = chain.steps.find((s) => s.id === stepId);
    if (!step) {
      return {
        isValid: false,
        issues: ["Step not found"],
        suggestions: [],
        confidence: 0,
      };
    }

    // Check for common reasoning errors
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 1. Check for contradictions with previous steps
    const contradictions = this.detectContradictions(chain, step);
    if (contradictions.length > 0) {
      issues.push(...contradictions);
      suggestions.push("Review previous steps for consistency");
    }

    // 2. Check for logical fallacies
    const fallacies = this.detectLogicalFallacies(step.thought);
    if (fallacies.length > 0) {
      issues.push(...fallacies);
      suggestions.push("Apply formal logic to strengthen reasoning");
    }

    // 3. Check confidence calibration
    if (step.confidence > 0.9 && !step.observation) {
      issues.push("High confidence without verification");
      suggestions.push("Verify with external sources or observations");
    }

    // 4. Check for incomplete reasoning
    if (step.thought.trim().length < 10) {
      issues.push("Reasoning too brief");
      suggestions.push("Elaborate on the thought process");
    }

    // 5. Detect Circular Reasoning
    if (this.detectCircularReasoning(chain, step)) {
      issues.push("Circular reasoning detected");
      suggestions.push("Break the loop by introducing new evidence or perspective");
    }

    const isValid = issues.length === 0;
    step.validated = true;

    // Calculate validation confidence
    const validationConfidence = isValid
      ? Math.min(step.confidence + 0.1, 1.0)
      : Math.max(step.confidence - 0.2, 0.1);

    return {
      isValid,
      issues,
      suggestions,
      confidence: validationConfidence,
    };
  }

  /**
   * Apply self-correction to a step
   */
  async correctStep(
    chainId: string,
    stepId: string,
    correction: string
  ): Promise<boolean> {
    const chain = this.activeChains.get(chainId) || this.completedChains.find(c => c.id === chainId);
    if (!chain) return false;

    const step = chain.steps.find((s) => s.id === stepId);
    if (!step) return false;

    // Record the correction
    if (!step.corrections) {
      step.corrections = [];
    }
    
    // Prevent duplicate corrections
    if (step.corrections.includes(correction)) return true;

    step.corrections.push(correction);
    step.corrected = true;
    chain.corrections++;

    // Adjust confidence after correction
    step.confidence = Math.min(step.confidence + 0.15, 1.0);

    return true;
  }

  /**
   * Complete a reasoning chain with a conclusion
   */
  concludeReasoning(
    chainId: string,
    conclusion: string
  ): ReasoningChain | null {
    const chain = this.activeChains.get(chainId);
    if (!chain) return null;

    chain.conclusion = conclusion;
    chain.endTime = Date.now();

    // Calculate overall confidence as weighted average
    if (chain.steps.length > 0) {
      // Recent steps have more weight
      const weights = chain.steps.map((_, i) =>
        Math.pow(1.1, i)
      );
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const weightedConfidence = chain.steps.reduce(
        (sum, step, i) => sum + step.confidence * weights[i],
        0
      );
      chain.overallConfidence = weightedConfidence / totalWeight;
    }

    // Validate the entire chain
    chain.validationPassed = this.validateChain(chain);

    // Move to completed
    this.activeChains.delete(chainId);
    this.completedChains.push(chain);

    // Keep only last 50 completed chains to reduce memory footprint
    if (this.completedChains.length > 50) {
      this.completedChains = this.completedChains.slice(-50);
    }

    return chain;
  }

  /**
   * Recover from an error
   */
  async recoverFromError(
    chainId: string,
    error: Error,
    context: string
  ): Promise<ErrorRecovery> {
    const chain = this.activeChains.get(chainId);
    
    const recovery: ErrorRecovery = {
      errorType: error.name,
      originalAction: context,
      recoveryStrategy: "",
      recovered: false,
      attempts: 1,
    };

    if (!chain) {
      recovery.recoveryStrategy = "Chain not found, cannot recover";
      return recovery;
    }

    // Determine recovery strategy based on error type
    if (error.message.includes("timeout")) {
      recovery.recoveryStrategy = "Retry with increased timeout";
      // Add a retry step
      this.addStep(
        chainId,
        "Detected timeout error, retrying with longer timeout",
        "retry_with_timeout",
        null,
        0.6
      );
      recovery.recovered = true;
    } else if (error.message.includes("not found")) {
      recovery.recoveryStrategy =
        "Try alternative data source or relax constraints";
      this.addStep(
        chainId,
        "Resource not found, exploring alternative approaches",
        "explore_alternatives",
        null,
        0.5
      );
      recovery.recovered = true;
    } else if (error.message.includes("invalid")) {
      recovery.recoveryStrategy = "Validate and sanitize input data";
      this.addStep(
        chainId,
        "Invalid data detected, applying validation and sanitization",
        "validate_and_sanitize",
        null,
        0.7
      );
      recovery.recovered = true;
    } else {
      recovery.recoveryStrategy = "Fallback to simpler approach";
      this.addStep(
        chainId,
        "Unexpected error, simplifying approach",
        "fallback_strategy",
        null,
        0.4
      );
      recovery.recovered = true;
    }

    return recovery;
  }

  /**
   * Get active reasoning chains
   */
  getActiveChains(): ReasoningChain[] {
    return Array.from(this.activeChains.values());
  }

  /**
   * Get completed reasoning chains
   */
  getCompletedChains(limit: number = 20): ReasoningChain[] {
    return this.completedChains.slice(-limit);
  }

  /**
   * Get a specific chain
   */
  getChain(chainId: string): ReasoningChain | null {
    return this.activeChains.get(chainId) || this.completedChains.find(c => c.id === chainId) || null;
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private detectContradictions(
    chain: ReasoningChain,
    currentStep: ReasoningStep
  ): string[] {
    const contradictions: string[] = [];
    const currentLower = currentStep.thought.toLowerCase();

    // Check for direct negations in previous steps
    for (const prevStep of chain.steps) {
      if (prevStep.id === currentStep.id) continue;

      const prevLower = prevStep.thought.toLowerCase();

      // Simple contradiction detection
      if (
        (currentLower.includes("not") &&
          prevLower.includes(
            currentLower.replace("not", "").trim()
          )) ||
        (prevLower.includes("not") &&
          currentLower.includes(prevLower.replace("not", "").trim())) ||
        (currentLower.includes("negates") && currentLower.includes(prevLower)) ||
        (currentLower.includes("not true") && prevLower.includes("true"))
      ) {
        contradictions.push(
          `Potential contradiction with step ${prevStep.stepNumber}`
        );
      }

      // Check for opposite conclusions
      const oppositePatterns = [
        ["increase", "decrease"],
        ["true", "false"],
        ["yes", "no"],
        ["accept", "reject"],
        ["valid", "invalid"],
      ];

      for (const [word1, word2] of oppositePatterns) {
        if (
          (currentLower.includes(word1) && prevLower.includes(word2)) ||
          (currentLower.includes(word2) && prevLower.includes(word1))
        ) {
          contradictions.push(
            `Opposite conclusion from step ${prevStep.stepNumber}`
          );
        }
      }
    }

    return contradictions;
  }

  private detectLogicalFallacies(thought: string): string[] {
    const fallacies: string[] = [];
    const lower = thought.toLowerCase();

    // Hasty generalization
    if (
      (lower.includes(" always ") || lower.includes(" never ")) &&
      !lower.includes(" almost ") && !lower.includes(" typically ")
    ) {
      fallacies.push("Possible hasty generalization (too absolute)");
    }

    // Appeal to authority without evidence
    if (
      lower.includes("everyone knows") && !lower.includes("evidence") && !lower.includes("proof")
    ) {
      fallacies.push("Appeal to authority without evidence");
    }

    // Circular reasoning (high repetition of long words)
    const words = lower.split(/\s+/).filter(w => w.length > 4);
    if (words.length > 10) {
      const uniqueWords = new Set(words);
      if (uniqueWords.size < words.length * 0.3) {
        fallacies.push("Possible circular reasoning (high word repetition)");
      }
    }

    return fallacies;
  }

  private detectCircularReasoning(chain: ReasoningChain, currentStep: ReasoningStep): boolean {
    const currentLower = currentStep.thought.toLowerCase();
    const currentTokens = new Set(currentLower.split(/\s+/).filter(w => w.length > 3)); // Lowered length threshold
    
    for (const prevStep of chain.steps) {
      if (prevStep.id === currentStep.id) continue;
      
      const prevLower = prevStep.thought.toLowerCase();
      const prevTokens = prevLower.split(/\s+/).filter(w => w.length > 3);
      
      if (prevTokens.length === 0) continue;

      // Check if current step is essentially repeating a previous step with slightly different words
      let overlap = 0;
      for (const token of prevTokens) {
        if (currentTokens.has(token)) overlap++;
      }
      
      const overlapRatio = overlap / prevTokens.length;
      if (overlapRatio > 0.7) { // Lowered overlap threshold
        return true;
      }
    }
    
    return false;
  }

  private validateChain(chain: ReasoningChain): boolean {
    // Chain is valid if:
    // 1. Has at least 2 steps
    // 2. Overall confidence > 0.6
    // 3. Has a conclusion
    // 4. Not too many corrections

    if (chain.steps.length < 2) return false;
    if (chain.overallConfidence < 0.6) return false;
    if (!chain.conclusion) return false;
    if (chain.corrections > chain.steps.length * 0.5) return false;

    return true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────

let reasoningEngineInstance: ReasoningEngine | null = null;

export function getReasoningEngine(): ReasoningEngine {
  if (!reasoningEngineInstance) {
    reasoningEngineInstance = new ReasoningEngine();
  }
  return reasoningEngineInstance;
}

// ─── Helper Functions ────────────────────────────────────────────────

/**
 * Start a reasoning task
 */
export function startReasoningTask(
  agentId: AgentId,
  query: string
): ReasoningChain {
  const engine = getReasoningEngine();
  return engine.startReasoning(agentId, query);
}

/**
 * Add a thought to the reasoning chain
 */
export function addReasoningThought(
  chainId: string,
  thought: string,
  action: string,
  confidence: number = 0.8
): ReasoningStep | null {
  const engine = getReasoningEngine();
  return engine.addStep(chainId, thought, action, null, confidence);
}

/**
 * Conclude reasoning with final answer
 */
export function concludeReasoningTask(
  chainId: string,
  conclusion: string
): ReasoningChain | null {
  const engine = getReasoningEngine();
  return engine.concludeReasoning(chainId, conclusion);
}

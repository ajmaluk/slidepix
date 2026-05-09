import { routeDalamChat } from "../dalamRouter";
import { dbClient } from "@/integrations/firebase/client";
import { type ChatMessage } from "../dalamRouter";

export interface AgentTool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

export interface AgentObservation {
  tool: string;
  input: string;
  output: string;
}

export interface AgentAction {
  tool: string;
  input: string;
}

export type AgentCallback = (event: "thought" | "action" | "observation" | "answer", data: any) => void;

// ─── Tools Definition ───

export const WEB_FETCH_TOOL: AgentTool = {
  name: "web_fetch",
  description: "Fetches the text content of any URL. Input must be exactly a valid HTTP/HTTPS URL. Use this to read articles, docs, or specific pages.",
  execute: async (url: string) => {
    try {
      if (!url.startsWith("http")) return "Error: Invalid URL. Must start with http or https.";
      const { data, error } = await dbClient.functions.invoke("web-fetch", { body: { url: url.trim() } });
      if (error) return `Error fetching URL: ${error.message}`;
      if (!data?.success) return `Error fetching URL: ${data?.error || "Unknown error"}`;
      return data.text || "Empty page content.";
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }
};

import { runWebSearch } from "../dalamRouter";

export const WEB_SEARCH_TOOL: AgentTool = {
  name: "web_search",
  description: "Searches the web for information. Input must be a search query. Use this to find recent news, facts, or discover URLs to fetch.",
  execute: async (query: string) => {
    try {
      const { results, summary } = await runWebSearch({ query });
      if (summary) return `AI Summary: ${summary}\n\nSources:\n` + results.map(r => `- ${r.title}: ${r.url}`).join("\n");
      if (results.length === 0) return "No results found.";
      return results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`).join("\n\n");
    } catch (e: any) {
      return `Error searching: ${e.message}`;
    }
  }
};

export const BROWSER_TOOLS: AgentTool[] = [WEB_FETCH_TOOL, WEB_SEARCH_TOOL];

// ─── ReAct Loop Implementation ───

/**
 * Parses the classic ReAct output format:
 * Thought: ...
 * Action: Name[input]
 * OR
 * Final Answer: ...
 */
export function parseAction(response: string): { action?: AgentAction; finalAnswer?: string; thought: string } {
  let thought = "";
  let finalAnswer: string | undefined = undefined;
  let action: AgentAction | undefined = undefined;

  const lines = response.split('\n');
  let currentBlock = "";
  
  for (const line of lines) {
    if (line.startsWith("Thought:")) {
      currentBlock = "thought";
      thought += line.substring(8).trim() + "\n";
    } else if (line.startsWith("Action:")) {
      currentBlock = "action";
      const actionRaw = line.substring(7).trim();
      // Expecting format ToolName[input]
      const openIdx = actionRaw.indexOf("[");
      const closeIdx = actionRaw.lastIndexOf("]");
      if (openIdx > 0 && closeIdx > openIdx) {
        action = {
          tool: actionRaw.slice(0, openIdx).trim(),
          input: actionRaw.slice(openIdx + 1, closeIdx).trim(),
        };
      }
    } else if (line.startsWith("Final Answer:")) {
      currentBlock = "answer";
      finalAnswer = line.substring(13).trim();
    } else if (currentBlock === "thought") {
      thought += line + "\n";
    } else if (currentBlock === "answer") {
      finalAnswer = (finalAnswer || "") + "\n" + line;
    }
  }

  // Fallback if the agent ignores the exact syntax
  if (!action && !finalAnswer) {
    finalAnswer = response; 
  }

  return { action, finalAnswer, thought: thought.trim() };
}

export class BrowserAgent {
  private tools: Map<string, AgentTool> = new Map();
  private maxIterations = 5;

  constructor(tools: AgentTool[] = BROWSER_TOOLS) {
    tools.forEach(t => this.tools.set(t.name, t));
  }

  getSystemPrompt(): string {
    const toolDescs = Array.from(this.tools.values())
      .map(t => `- ${t.name}: ${t.description} (Syntax: Action: ${t.name}[input])`)
      .join("\n");

    return `You are a reasoning agent capable of using tools to fetch external information.
You must run in a loop of Thought, Action, PAUSE, Observation.
At the end of the loop you output an Answer.

Use specific tools when you need to read URLs or perform searches.
Available tools:
${toolDescs}

Example Session:
Question: What is the text on https://lovable.dev?
Thought: I need to fetch the content of this URL.
Action: web_fetch[https://lovable.dev]

You will be called again with:
Observation: <fetched content>
Thought: I now have the content. I can answer the question.
Final Answer: The text on the website is...

Rules:
1. ALWAYS use the exact format "Action: tool_name[input]" when calling a tool.
2. DO NOT output "Observation:". This will be provided to you by the system.
3. If you have enough information, output "Final Answer: <your full answer>".
4. For time-sensitive questions (latest/current/today/price/news/live), you MUST call web_search before Final Answer.
`;
  }

  private isTimeSensitiveQuery(query: string): boolean {
    return /\b(latest|current|today|now|live|price|market|news|update|breaking|stock|gold|silver|oil|btc|bitcoin|eth|ethereum)\b/i.test(query);
  }

  private getIterationBudget(query: string): number {
    const wordCount = query.trim().split(/\s+/).filter(Boolean).length;
    let budget = this.maxIterations;
    if (wordCount > 20) budget += 2;
    if (this.isTimeSensitiveQuery(query)) budget += 2;
    return Math.min(9, budget);
  }

  async run(
    query: string, 
    contextHistory: ChatMessage[], 
    callback?: AgentCallback,
    onChunk?: (text: string) => void
  ): Promise<string> {
    
    // Build agent trajectory history
    const trajectory: ChatMessage[] = [
      ...contextHistory, 
      { role: "user", content: query }
    ];

    // Ensure system prompt is present
    const sysPrompt = this.getSystemPrompt();
    if (trajectory[0]?.role === "system") {
      trajectory[0].content = sysPrompt + "\n\n" + trajectory[0].content;
    } else {
      trajectory.unshift({ role: "system", content: sysPrompt });
    }

    const iterationBudget = this.getIterationBudget(query);
    let hasPerformedSearch = false;

    for (let i = 0; i < iterationBudget; i++) {
      let agentOutput = "";
      callback?.("thought", { iteration: i+1 });
      
      let isYieldingFinalAnswer = false;
      let streamedFinalIndex = 0;

      await routeDalamChat({
        messages: trajectory,
        tier: "pro", // always use pro tier for ReAct loop logic to ensure formatting compliance
        onChunk: (chunk) => { 
          agentOutput += chunk; 
          
          if (!isYieldingFinalAnswer) {
            const finalMatch = agentOutput.indexOf("Final Answer:");
            if (finalMatch !== -1) {
              isYieldingFinalAnswer = true;
              const finalPart = agentOutput.slice(finalMatch + 13).trimStart();
              streamedFinalIndex = finalMatch + 13 + finalPart.length;
              if (finalPart && onChunk) onChunk(finalPart);
            }
          } else if (isYieldingFinalAnswer && onChunk) {
            const newContent = agentOutput.slice(streamedFinalIndex);
            if (newContent) {
               onChunk(newContent);
               streamedFinalIndex += newContent.length;
            }
          }
        }
      });

      trajectory.push({ role: "assistant", content: agentOutput });

      const parsed = parseAction(agentOutput);

      if (parsed.thought) {
        callback?.("thought", { thought: parsed.thought });
      }

      if (parsed.finalAnswer) {
        if (this.isTimeSensitiveQuery(query) && !hasPerformedSearch) {
          trajectory.push({
            role: "user",
            content: "Before giving Final Answer, call Action: web_search[...] for this time-sensitive query and use those results."
          });
          continue;
        }
        callback?.("answer", { answer: parsed.finalAnswer });
        return parsed.finalAnswer;
      }

      if (parsed.action) {
        const { tool, input } = parsed.action;
        if (tool === "web_search") hasPerformedSearch = true;
        callback?.("action", parsed.action);

        const toolDef = this.tools.get(tool);
        let observation = "";

        if (!toolDef) {
          observation = `Error: Tool '${tool}' not found.`;
        } else {
          try {
            observation = await toolDef.execute(input);
            // Context window bloat protection: Truncate large observations
            if (observation.length > 3000) {
              observation = observation.substring(0, 3000) + "\n...[Truncated for length]";
            }
          } catch (e: any) {
            observation = `Error executing tool: ${e.message}`;
          }
        }

        callback?.("observation", { tool, observation });
        trajectory.push({ role: "user", content: `Observation: ${observation}` });
      } else {
        // Agent returned neither an action nor a final answer, force it to answer
        trajectory.push({ role: "user", content: "You did not provide an Action or Final Answer. Please format your output correctly." });
      }
    }

    const abortMsg = "I've reached my maximum number of reasoning steps and couldn't find a complete answer.";
    if (onChunk) onChunk(abortMsg);
    callback?.("answer", { answer: abortMsg });
    return abortMsg;
  }
}

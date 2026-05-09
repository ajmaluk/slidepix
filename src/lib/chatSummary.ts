import { routeDalamChat } from "./dalamRouter";
import type { Conversation } from "./chat";
import { loadSettings } from "./settings";

// Trigger summarization when we have this many un-summarized messages
const SUMMARIZE_THRESHOLD = 20;
// Leave this many recent messages untouched (part of the immediate context)
const KEEP_RECENT = 10;
const SUMMARY_COOLDOWN_MS = 30_000;
const MAX_TRANSCRIPT_CHARS = 32_000;
const summaryInFlight = new Set<string>();
const lastSummaryRunAt = new Map<string, number>();

/**
 * Byteclaw-style Rolling Summarization
 * Checks if the conversation has accumulated enough messages to warrant a background summarize.
 * If so, takes the oldest un-summarized messages, summarizes them using the LLM, 
 * and updates the conversation's rolling summary.
 */
export async function maybeSummarizeConversation(
  conversation: Conversation,
  updateConversation: (id: string, updates: Partial<Conversation>) => void
): Promise<void> {
  if (summaryInFlight.has(conversation.id)) return;
  const lastRun = lastSummaryRunAt.get(conversation.id) || 0;
  if (Date.now() - lastRun < SUMMARY_COOLDOWN_MS) return;

  const lastIdx = conversation.lastSummarizedIndex ?? -1;
  const totalMessages = conversation.messages.length;
  
  // Calculate how many messages are "pending" summarization
  // We leave the most recent 10 messages strictly alone for perfect immediate recall
  const unsummarizedCount = totalMessages - (lastIdx + 1) - KEEP_RECENT;

  if (unsummarizedCount < SUMMARIZE_THRESHOLD) {
    return; // Not enough messages to bother summarizing yet
  }

  const messagesToSummarize = conversation.messages.slice(lastIdx + 1, lastIdx + 1 + unsummarizedCount);
  
  // Format the messages for the LLM
  let chatTranscript = "";
  for (const msg of messagesToSummarize) {
    if (msg.role !== 'system') {
      const line = `[${msg.role}]: ${msg.content}\n\n`;
      if (chatTranscript.length + line.length > MAX_TRANSCRIPT_CHARS) break;
      chatTranscript += line;
    }
  }

  if (!chatTranscript.trim()) return;

  const previousSummaryText = conversation.summary 
    ? `Here is the existing summary of the conversation prior to these messages:\n<existing_summary>\n${conversation.summary}\n</existing_summary>\n\n`
    : "";

  const prompt = `You are a background memory-compression agent. Your job is to maintain a continuous, highly accurate running summary of a conversation.\n\n` + 
    previousSummaryText +
    `Here are the next ${unsummarizedCount} messages in the conversation:\n<new_messages>\n${chatTranscript}</new_messages>\n\n` +
    `Please write a comprehensive, dense, and concise summary that incorporates the <existing_summary> (if any) and the <new_messages>. ` +
    `Focus strictly on: \n1. Important facts shared by the user.\n2. Key decisions or conclusions reached.\n3. The overarching goal of the user.\n\n` +
    `Return ONLY the summary text, nothing else.`;

  summaryInFlight.add(conversation.id);
  lastSummaryRunAt.set(conversation.id, Date.now());
  try {
    const settings = loadSettings();
    const activeProvider = settings.activeProvider === "dalam" ? "dalam" : settings.activeProvider;
    const providerSettings = settings.providers[activeProvider];

    let newSummary = "";

    await routeDalamChat({
      messages: [{ role: "user", content: prompt }],
      tier: "pro", // Background tasks should preferably use higher tier for logic if available
      onChunk: (chunk) => { newSummary += chunk; },
      forcedProvider: activeProvider, // Can fallback to groq for speed
      selectedModel: providerSettings?.selectedModel,
      apiKey: providerSettings?.requiresKey ? providerSettings.apiKey : undefined,
      baseUrl: providerSettings?.baseUrl,
    });

    const trimmed = newSummary.trim();
    if (trimmed) {
      // Avoid noisy updates if the summary hasn't meaningfully changed
      const MAX_SUMMARY_CHARS = 20000;
      const finalSummary = trimmed.length > MAX_SUMMARY_CHARS ? trimmed.slice(0, MAX_SUMMARY_CHARS) + " ...[truncated]" : trimmed;
      if (conversation.summary?.trim() !== finalSummary) {
        updateConversation(conversation.id, {
          summary: finalSummary,
          lastSummarizedIndex: lastIdx + unsummarizedCount
        });
        console.log(`[Agent] Rolled up ${unsummarizedCount} messages into conversation summary.`);
      } else {
        console.log(`[Agent] New summary identical to existing summary; skipping update.`);
      }
    }

  } catch (err) {
    console.error(`[Agent] Background summarization failed:`, err);
  } finally {
    summaryInFlight.delete(conversation.id);
  }
}

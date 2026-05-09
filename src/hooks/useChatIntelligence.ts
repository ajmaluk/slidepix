import { useCallback, useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";
import { getUserBrain } from "@/lib/memory/userBrain";
import { getAgentMemoryManager } from "@/lib/memory/agentMemory";
import type { AgentId } from "@/lib/chat";
import { getKnowledgeExtractor } from "@/lib/memory/knowledgeExtractor";
import { getEnhancedMemory } from "@/lib/enhancedMemory";
import { getEmotionalIntelligence } from "@/lib/emotionalIntelligence";
import { 
  buildAdaptivePersonaBlock, 
  evolveAdaptivePersona, 
  loadAdaptivePersonaState, 
  saveAdaptivePersonaState 
} from "@/lib/adaptivePersona";
import { buildTemporalContextSnippet, indexTemporalStatements, looksLikeTemporalQuery } from "@/lib/reminders";
import { buildRecentOCRMemoryLines } from "@/lib/ocr";
import { semanticSearch, type SemanticIndex } from "@/lib/semanticSearch";

/**
 * useChatIntelligence Hook
 * 
 * Orchestrates all memory layers and intelligent features into a single,
 * high-level interface for the Chat component.
 * 
 * Layers included:
 * - UserBrain: Personal facts and identity
 * - AgentMemory: Experience-based learning
 * - KnowledgeExtractor: Dynamic topic and entity extraction
 * - EnhancedMemory: Broad pattern and communication style tracking
 * - EmotionalIntelligence: Emotional resonance and support
 * - AdaptivePersona: Dynamic agent persona evolution
 * - TemporalMemory: Date/time sensitive recall
 * - SemanticSearch: Multi-conversation context retrieval
 */
export function useChatIntelligence() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const session = useChatStore((s) => s.session);
  const conversationId = activeId ?? "default";
  
  const activeConv = useMemo(() => 
    conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );
  const temporalStatements = useMemo(() => indexTemporalStatements(conversations), [conversations]);
  const recentOcrContext = useMemo(
    () => buildRecentOCRMemoryLines(activeConv?.messages || []).join("\n"),
    [activeConv?.messages]
  );

  const isLoggedIn = Boolean(session?.user?.id);

  /**
   * Ingests current message and context into all memory layers.
   */
  const learnFromInteraction = useCallback(async (userMessage: string, assistantResponse: string) => {
    if (!isLoggedIn) return "error";

    const userBrain = getUserBrain();
    const agentMemory = getAgentMemoryManager();
    const knowledgeExtractor = getKnowledgeExtractor();
    const enhancedMemory = getEnhancedMemory();
    const emotionalIntelligence = getEmotionalIntelligence();

    // 1. Extract facts and identity
    await userBrain.processMessage(userMessage, assistantResponse);
    
    // 2. Extract domain knowledge and entities
    await knowledgeExtractor.extractFromInteraction(userMessage, assistantResponse, conversationId);
    
    // 3. Track communication patterns and broad topics
    enhancedMemory.ingestConversations(conversations, { isGuest: !isLoggedIn });
    
    // 4. Update emotional profile
    const emotion = emotionalIntelligence.processInteraction(userMessage);
    
    // 5. Evolve persona based on interaction quality
    const personaState = loadAdaptivePersonaState(conversationId, !isLoggedIn);
    const evolvedPersona = evolveAdaptivePersona(personaState, userMessage, emotion);
    saveAdaptivePersonaState(evolvedPersona, !isLoggedIn);

    // 6. Index temporal statements for reminders/deadlines
    // Statements are indexed from history during retrieval context building.
    
    // 7. Store agent experience
    const experienceAgentId = (activeId ?? "arun") as AgentId;
    await agentMemory.recordExperience(experienceAgentId, {
      query: userMessage,
      answer: assistantResponse,
      timestamp: Date.now(),
      importance: emotion.emotionIntensity > 0.7 ? 0.8 : 0.4
    });
  }, [isLoggedIn, conversations, activeId, conversationId]);

  /**
   * Orchestrates broad context retrieval for the system prompt.
   */
  const getIntelligenceContext = useCallback(async (
    currentQuery: string, 
    semanticIndex: SemanticIndex | null
  ) => {
    const userBrain = getUserBrain();
    const enhancedMemory = getEnhancedMemory();
    const emotionalIntelligence = getEmotionalIntelligence();
    const knowledgeExtractor = getKnowledgeExtractor();

    // Parallel retrieval for speed
    const emotion = emotionalIntelligence.processInteraction(currentQuery);
    const personaState = loadAdaptivePersonaState(conversationId, !isLoggedIn);

    const [
      brainContext,
      enhancedContext,
      emotionalContext,
      knowledgeContext,
      temporalContext,
      adaptivePersonaContext
    ] = await Promise.all([
      userBrain.getRelevantContext(currentQuery),
      enhancedMemory.getMemorySummary(),
      emotionalIntelligence.getSupportiveContext(emotion),
      knowledgeExtractor.getRelevantKnowledge(currentQuery),
      buildTemporalContextSnippet(temporalStatements, currentQuery),
      buildAdaptivePersonaBlock(personaState)
    ]);

    // Semantic search across other conversations
    let semanticContext = "";
    if (semanticIndex && currentQuery.length > 5) {
      const results = semanticSearch(currentQuery, semanticIndex, 5);
      semanticContext = results
        .filter(r => {
          const chunk = semanticIndex.chunks[r.chunkIndex];
          return chunk && chunk.sourceIndex !== undefined;
        })
        .map(r => {
          const chunk = semanticIndex.chunks[r.chunkIndex];
          const snippet = chunk.content.slice(0, 300);
          return `[From Past Context] ${snippet}`;
        })
        .join("\n");
    }

    // OCR Memory (Visual Context)
    const ocrContext = recentOcrContext;

    return {
      brainContext,
      enhancedContext,
      emotionalContext,
      knowledgeContext,
      temporalContext,
      adaptivePersonaContext,
      semanticContext,
      ocrContext,
      combined: `
${brainContext ? `[User Identity & Facts]\n${brainContext}\n` : ""}
${enhancedContext ? `[User Patterns & Style]\n${enhancedContext}\n` : ""}
${emotionalContext ? `[Emotional Resonance]\n${emotionalContext}\n` : ""}
${knowledgeContext ? `[Domain Knowledge]\n${knowledgeContext}\n` : ""}
${temporalContext ? `[Time-Sensitive Context]\n${temporalContext}\n` : ""}
${semanticContext ? `[Relevant Past Interactions]\n${semanticContext}\n` : ""}
${ocrContext ? `[Visual Context Memory]\n${ocrContext}\n` : ""}
${adaptivePersonaContext ? `[System Evolution]\n${adaptivePersonaContext}\n` : ""}
      `.trim()
    };
  }, [conversationId, isLoggedIn, temporalStatements, recentOcrContext]);

  /**
   * Detects if the query needs deep retrieval (e.g. "Who am I?", "What did we talk about?")
   */
  const needsDeepRetrieval = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return (
      /\b(who am i|tell me about me|what do you know about me|my profile|about me|my name|describe me|personality)\b/i.test(lowerQuery) ||
      /\b(what did we say about|remember when|past conversation|previously mentioned)\b/i.test(lowerQuery) ||
      looksLikeTemporalQuery(lowerQuery)
    );
  }, []);

  return {
    learnFromInteraction,
    getIntelligenceContext,
    needsDeepRetrieval,
    activeConv,
    isLoggedIn
  };
}

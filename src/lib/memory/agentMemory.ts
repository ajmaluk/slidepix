/**
 * Agent Memory Management System
 * 
 * Provides a persistent and global memory layer for AI agents using IndexedDB.
 * Handles interaction recording, knowledge extraction, preference inference,
 * and semantic-like context retrieval across all conversations.
 */

import { type AgentId } from "@/lib/chat";
import { dalamDB, type IDBInteraction, type IDBKnowledge, type IDBPreference } from "@/lib/indexedDB";
import { generateId } from "@/lib/chat";

/**
   * Detailed record of a single agent-user interaction
   */
  // Add meaningful terms field to interaction record for fast querying
  export interface InteractionRecord {
    id: string;
    agentId: string;
    query: string;
    answer?: string;
    role: string;
    timestamp: number;
    agentActions?: string[];
    outcome?: "success" | "failure" | "partial";
    confidence?: number;
    duration?: number;
    contextUsed?: string[];
    importance?: number; // 0-1, how important this memory is
    tags?: string[];
    _meaningfulTerms?: string[];
    [key: string]: any;
  }

/**
 * Interface for the Agent Memory Manager service
 */
export interface AgentMemoryManager {
  /** Initializes the memory manager by loading data from IndexedDB */
  initialize: () => Promise<void>;
  /** Clears the in-memory state (primarily for testing) */
  clear: () => void;
  /** Persistently records a new interaction */
  recordInteraction: (agentId: AgentId, data: Partial<InteractionRecord>) => Promise<void>;
  /** Alias for recordInteraction to support new router implementation */
  recordExperience: (agentId: AgentId, data: Partial<InteractionRecord>) => Promise<void>;
  /** Adds extracted knowledge to the global memory pool */
  addKnowledge: (agentId: AgentId, topic: string, content: string, source: string) => Promise<void>;
  /** Retrieves all recorded interactions */
  getInteractions: () => Promise<IDBInteraction[]>;
  /** Get recent interactions for a specific agent */
  getRecentAgentInteractions: (agentId: AgentId, limit?: number) => Promise<IDBInteraction[]>;
  /** Infers and retrieves user preferences based on interaction history */
  getUserPreferences: () => Promise<{ category: string; preference: string }[]>;
  /** Performs a multi-stage retrieval of relevant interactions and knowledge for a query */
  retrieveMemories: (currentQuery: string) => Promise<{
    similarInteractions: (IDBInteraction & { similarity: number })[];
    relevantKnowledge: IDBKnowledge[];
  }>;
}

/**
 * Helper to calculate keyword-based similarity between two strings.
 * Filters out common stop words to improve relevance.
 */
function getSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", 
    "where", "why", "how", "is", "are", "was", "were", "to", "for", "in", 
    "on", "at", "by", "from", "with", "about", "as", "into", "of", "off", 
    "it", "its", "that", "this", "those", "these", "i", "me", "my", "you", 
    "your", "he", "him", "his", "she", "her", "hers", "we", "us", "our", "they", "them", "their",
    "am", "not", "no", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "shall", "can", "need"
  ]);

  const tokenize = (text: string) => {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  };

  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(word => set2.has(word)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

function getMeaningfulTerms(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", 
    "where", "why", "how", "is", "are", "was", "were", "to", "for", "in", 
    "on", "at", "by", "from", "with", "about", "as", "into", "of", "off", 
    "it", "its", "that", "this", "those", "these", "i", "me", "my", "you", 
    "your", "he", "him", "his", "she", "her", "hers", "we", "us", "our", "they", "them", "their",
    "am", "not", "no", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "shall", "can", "need",
    "up", "down", "out", "all", "any", "some", "few", "more", "most", "other",
    "such", "only", "own", "same", "so", "than", "too", "very", "just", "because",
    "now", "here", "there", "when", "what", "which", "who", "whom"
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 24);
}

function normalizeMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMemoryTerms(text: string): string[] {
  return [...new Set([
    ...getMeaningfulTerms(text),
    ...normalizeMemoryText(text).split(/\s+/).filter((word) => word.length > 2),
  ])].slice(0, 28);
}

function scoreMemorySimilarity(
  query: string,
  interaction: IDBInteraction & { similarity?: number; _importance?: number; _hasRelevantTag?: boolean },
  queryTerms: Set<string>
): number {
  const queryLower = query.toLowerCase();
  const interactionQuery = interaction.query || "";
  const interactionAnswer = interaction.answer || "";
  const combined = `${interactionQuery} ${interactionAnswer}`;
  const normalizedCombined = normalizeMemoryText(combined);

  const querySimilarity = getSimilarity(query, interactionQuery);
  const answerSimilarity = getSimilarity(query, interactionAnswer) * 0.9;
  let similarity = Math.max(querySimilarity, answerSimilarity);

  if (queryTerms.size > 0) {
    let overlap = 0;

    if (interaction._meaningfulTerms) {
      for (const term of interaction._meaningfulTerms) {
        if (queryTerms.has(term)) overlap++;
      }
    } else {
      const interactionTerms = getMemoryTerms(combined);
      for (const term of interactionTerms) {
        if (queryTerms.has(term)) overlap++;
      }
    }

    if (overlap > 0) {
      similarity += Math.min(0.45, (overlap / queryTerms.size) * 0.45);
    }
  }

  if (normalizedCombined.includes(normalizeMemoryText(query))) {
    similarity += 0.18;
  }

  const queryTokens = getMemoryTerms(query);
  for (const token of queryTokens) {
    if (token.length < 3) continue;
    if (normalizedCombined.includes(token)) {
      similarity += 0.03;
    }
  }

  const hasRelevantTag = interaction.tags?.some((tag: string) => queryLower.includes(tag));
  const importance = interaction.importance ?? 0.5;
  const importanceBoost =
    importance >= 0.85 ? 0.45 :
    importance >= 0.6 ? 0.25 :
    importance >= 0.4 ? 0.08 :
    -0.08;
  const tagBoost = hasRelevantTag ? 0.2 : 0;

  const ageDays = (Date.now() - interaction.timestamp) / (1000 * 60 * 60 * 24);
  const recency = Math.pow(0.992, ageDays);

  return Math.min(1, similarity * (1 + importanceBoost + tagBoost) * (0.7 + 0.3 * recency));
}

function scoreKnowledgeEntry(query: string, item: IDBKnowledge): number {
  const queryLower = query.toLowerCase();
  const queryTerms = new Set(getMemoryTerms(query));
  const topic = item.topic?.toLowerCase() || "";
  const content = item.content?.toLowerCase() || "";
  const source = item.source?.toLowerCase() || "";
  const combined = normalizeMemoryText(`${topic} ${content} ${source}`);

  let score = 0;

  if (topic && (queryLower.includes(topic) || topic.includes(queryLower))) score += 1.1;
  if (content && (queryLower.includes(content) || content.includes(queryLower))) score += 0.9;

  let overlap = 0;
  for (const term of queryTerms) {
    if (combined.includes(term)) overlap++;
  }
  if (overlap > 0) {
    score += Math.min(1.3, (overlap / Math.max(queryTerms.size, 1)) * 1.3);
  }

  if (queryTerms.size > 0) {
    const queryPrefix = [...queryTerms].slice(0, 4).join(" ");
    if (queryPrefix && combined.includes(queryPrefix)) score += 0.35;
  }

  const ageDays = (Date.now() - item.timestamp) / (1000 * 60 * 60 * 24);
  score *= Math.pow(0.993, ageDays);

  return score;
}

/**
 * Global memory state shared across the application lifecycle.
 */
const GLOBAL_MEMORY = {
  interactions: [] as IDBInteraction[],
  knowledge: [] as IDBKnowledge[],
  preferences: [] as IDBPreference[],
  isInitialized: false,
  initPromise: null as Promise<void> | null,
};

// Sync with window if available
if (typeof window !== 'undefined') {
  if (!(window as any)._DALAM_MEMORY_DB) {
    (window as any)._DALAM_MEMORY_DB = GLOBAL_MEMORY;
  } else {
    // If already exists, use it
    Object.assign(GLOBAL_MEMORY, (window as any)._DALAM_MEMORY_DB);
  }
}

/**
 * Factory function to get the Agent Memory Manager instance.
 */
export function getAgentMemoryManager(): AgentMemoryManager {
  /**
   * Loads all persistent memory from IndexedDB if not already initialized.
   */
  const initialize = async () => {
    if (GLOBAL_MEMORY.isInitialized) return;
    if (GLOBAL_MEMORY.initPromise) return GLOBAL_MEMORY.initPromise;
    
    GLOBAL_MEMORY.initPromise = Promise.all([
      dalamDB.getAllInteractions(),
      dalamDB.getAllKnowledge(),
      dalamDB.getAllPreferences()
    ]).then(([interactions, knowledge, preferences]) => {
      GLOBAL_MEMORY.interactions = interactions as IDBInteraction[];
      GLOBAL_MEMORY.knowledge = knowledge as IDBKnowledge[];
      GLOBAL_MEMORY.preferences = preferences as IDBPreference[];
      GLOBAL_MEMORY.isInitialized = true;
      GLOBAL_MEMORY.initPromise = null;
    });
    
    return GLOBAL_MEMORY.initPromise;
  };

  return {
    initialize,
    
    clear: () => {
      GLOBAL_MEMORY.interactions.length = 0;
      GLOBAL_MEMORY.knowledge.length = 0;
      GLOBAL_MEMORY.preferences.length = 0;
      GLOBAL_MEMORY.isInitialized = false;
    },

    recordInteraction: async (agentId: AgentId, data: Partial<InteractionRecord>) => {
      await initialize();
      
      // Auto-tagging based on query content
      const tags = [...(data.tags || [])];
      if (data.query) {
        const q = data.query.toLowerCase();
        if (q.includes("code") || q.includes("function") || q.includes("class")) tags.push("technical");
        if (q.includes("how") || q.includes("why") || q.includes("what")) tags.push("question");
        if (q.includes("error") || q.includes("fix") || q.includes("problem")) tags.push("troubleshooting");
      }

      const interaction: IDBInteraction = {
        id: generateId(),
        agentId,
        query: "",
        role: "user",
        timestamp: Date.now(),
        importance: data.importance ?? 0.5,
        ...data,
        tags: [...new Set(tags)],
        _meaningfulTerms: getMemoryTerms(`${data.query || ""} ${data.answer || ""}`)
      };
      
      // Ensure defaults if data provided them as undefined/null
      if (!interaction.query) interaction.query = "";
      if (!interaction.role) interaction.role = "user";
      
      GLOBAL_MEMORY.interactions.push(interaction);
      await dalamDB.saveInteraction(interaction);
    },

    recordExperience: async (agentId: AgentId, data: Partial<InteractionRecord>) => {
      // Direct alias to recordInteraction for consistency
      return getAgentMemoryManager().recordInteraction(agentId, data);
    },

    addKnowledge: async (agentId: AgentId, topic: string, content: string, source: string) => {
      await initialize();
      const normalizedTopic = normalizeMemoryText(topic);
      const normalizedContent = normalizeMemoryText(content);
      const normalizedSource = normalizeMemoryText(source);
      const duplicate = GLOBAL_MEMORY.knowledge.find((item) => {
        const sameAgent = item.agentId === agentId;
        const sameTopic = normalizeMemoryText(item.topic || "") === normalizedTopic;
        const sameContent = normalizeMemoryText(item.content || "") === normalizedContent;
        const sameSource = normalizeMemoryText(item.source || "") === normalizedSource;
        return sameAgent && sameTopic && sameContent && sameSource;
      });

      if (duplicate) {
        duplicate.timestamp = Date.now();
        duplicate.content = content;
        duplicate.topic = topic;
        duplicate.source = source;
        await dalamDB.saveKnowledge(duplicate);
        return;
      }

      const item: IDBKnowledge = {
        id: generateId(),
        agentId,
        topic,
        content,
        source,
        timestamp: Date.now()
      };
      GLOBAL_MEMORY.knowledge.push(item);
      await dalamDB.saveKnowledge(item);
    },

    /**
     * Retrieves all recorded interactions
     */
    getInteractions: async () => {
        await initialize();
        return GLOBAL_MEMORY.interactions;
    },

    /**
     * Get recent interactions for a specific agent
     */
    getRecentAgentInteractions: async (agentId: AgentId, limit: number = 10) => {
      await initialize();
      return GLOBAL_MEMORY.interactions
        .filter(i => i.agentId === agentId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    },

    /**
     * Dynamically infers user preferences by analyzing the tone and 
     * explicit requests in past interactions.
     */
    getUserPreferences: async () => {
        await initialize();
        const inferred: { category: string; preference: string }[] = [];
        let conciseCount = 0;
        let detailedCount = 0;

        for (const interaction of GLOBAL_MEMORY.interactions) {
            if (interaction.query) {
                const query = interaction.query.toLowerCase();
                if (query.includes("concise") || query.includes("short")) {
                    conciseCount++;
                }
                if (query.includes("detailed") || query.includes("in-depth")) {
                    detailedCount++;
                }
            }
        }

        if (conciseCount > detailedCount && conciseCount > 1) {
            inferred.push({ category: "responseLength", preference: "prefers concise responses" });
        } else if (detailedCount > conciseCount && detailedCount > 1) {
            inferred.push({ category: "responseLength", preference: "prefers detailed responses" });
        }
        
        // Merge with explicitly stored preferences from IndexedDB
        return [...inferred, ...GLOBAL_MEMORY.preferences.map((p: any) => ({ category: p.category, preference: p.preference }))];
    },

    /**
     * Retrieves contextually relevant memories using keyword similarity.
     * Stage 1: Find similar past interactions.
     * Stage 2: Extract relevant knowledge snippets.
     */
    retrieveMemories: async (currentQuery: string) => {
        await initialize();
        
        const q = currentQuery.toLowerCase();
        const queryTerms = new Set(getMemoryTerms(currentQuery));
        const normalizedQuery = normalizeMemoryText(currentQuery);
        
        // Stage 1: Find similar past interactions
        // Use a time-limited scan for performance at scale
        const recentLimit = GLOBAL_MEMORY.interactions.length > 750 ? 750 : GLOBAL_MEMORY.interactions.length;
        const interactionPool = GLOBAL_MEMORY.interactions.length > recentLimit 
            ? GLOBAL_MEMORY.interactions.slice(-recentLimit)
            : GLOBAL_MEMORY.interactions;

        const similarInteractions = interactionPool
            .map((interaction: any) => {
                const similarity = scoreMemorySimilarity(currentQuery, interaction, queryTerms);
                const hasRelevantTag = interaction.tags?.some((tag: string) => q.includes(tag));

                return {
                    ...interaction,
                    similarity: Math.min(1, similarity + (normalizedQuery && normalizeMemoryText(interaction.query || "").includes(normalizedQuery) ? 0.05 : 0)),
                    _importance: interaction.importance ?? 0.5,
                    _hasRelevantTag: hasRelevantTag,
                };
            })
            .filter((interaction: any) => interaction.similarity > 0.08)
            .sort((a: any, b: any) => {
                const scoreA = a.similarity * (1 + (a._importance >= 0.8 ? 0.45 : a._importance >= 0.5 ? 0.18 : -0.08) + (a._hasRelevantTag ? 0.2 : 0));
                const scoreB = b.similarity * (1 + (b._importance >= 0.8 ? 0.45 : b._importance >= 0.5 ? 0.18 : -0.08) + (b._hasRelevantTag ? 0.2 : 0));
                const ageA = (Date.now() - a.timestamp) / (1000 * 60 * 60 * 24); // days
                const ageB = (Date.now() - b.timestamp) / (1000 * 60 * 60 * 24);
                return scoreB * Math.pow(0.992, ageB) - scoreA * Math.pow(0.992, ageA);
            })
            .slice(0, 8);

        // Stage 2: Extract relevant knowledge bits
        const relevantKnowledge = GLOBAL_MEMORY.knowledge
            .map((item: any) => {
              return { item, score: scoreKnowledgeEntry(currentQuery, item) };
            })
            .filter((entry: any) => entry.score > 0.15)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 12)
            .map((entry: any) => entry.item); // Increased limit for better cross-context

        return {
            similarInteractions,
            relevantKnowledge,
        };
    },
  };
}

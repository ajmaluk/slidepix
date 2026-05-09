/**
 * Advanced Context Manager v2 — Parallel Search with BM25 + Inverted Index
 * 
 * Improvements over v1:
 * 1. Inverted index for O(1) term lookups instead of scanning all messages
 * 2. BM25 scoring (industry standard) replacing basic TF-IDF cosine
 * 3. Semantic chunking — splits long messages into meaningful segments
 * 4. Parallel search lanes: entity search, keyword search, recency search
 * 5. Faster cross-session search with pre-built index cache
 * 6. Weighted fusion of multiple retrieval signals
 */

import type { Message, Conversation } from "./chat";
import { getActiveContent } from "./chat";
import { getKnowledgeExtractor } from "./memory/knowledgeExtractor";

// ─── Types ───────────────────────────────────────────────────────────

export interface ContextWindow {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  summary: string | null;
  totalTokens: number;
  includedCount: number;
  totalCount: number;
  relevantMemories: MemoryFragment[];
  contextLayers: ContextLayerStats;
  searchMetrics?: SearchMetrics;
  userInsights?: string;
}

export interface MemoryFragment {
  content: string;
  role: "user" | "assistant" | "system";
  relevanceScore: number;
  source: "current" | "history";
  timestamp: Date;
  entities: string[];
  matchType?: "keyword" | "entity" | "semantic" | "recency";
}

export interface ContextLayerStats {
  recentMessages: number;
  relevantOlderMessages: number;
  summarizedMessages: number;
  crossSessionMemories: number;
  estimatedCompression: string;
}

export interface SearchMetrics {
  indexBuildTimeMs: number;
  searchTimeMs: number;
  candidatesScanned: number;
  candidatesSelected: number;
  searchLanes: { name: string; resultsFound: number; timeMs: number }[];
}

interface ContextConfig {
  maxTokens: number;
  recentWindowSize: number;
  relevanceThreshold: number;
  maxMemoryFragments: number;
  enableSummarization: boolean;
  enableMemorySearch: boolean;
  enableEntityTracking: boolean;
  decayFactor: number;
  queryComplexityBoost: boolean;
  bm25k1: number;
  bm25b: number;
  chunkMaxTokens: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 16000,
  recentWindowSize: 8,
  relevanceThreshold: 0.10,
  maxMemoryFragments: 10,
  enableSummarization: true,
  enableMemorySearch: true,
  enableEntityTracking: true,
  decayFactor: 0.95,
  queryComplexityBoost: true,
  bm25k1: 1.5,
  bm25b: 0.75,
  chunkMaxTokens: 200,
};

// ─── Token Estimation ────────────────────────────────────────────────

function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  const specialChars = (text.match(/[^\w\s]/g) || []).length;
  return Math.ceil(words * 1.3 + specialChars * 0.5);
}

function truncateToTokenBudget(text: string, tokenBudget: number): string {
  if (tokenBudget <= 0) return "";
  if (estimateTokens(text) <= tokenBudget) return text;

  let low = 1;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid).trimEnd();
    if (estimateTokens(candidate) <= tokenBudget) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return `${best} ...[truncated]`;
}

function enforceContextTokenLimit(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  maxTokens: number
): { role: "user" | "assistant" | "system"; content: string }[] {
  if (messages.length === 0) return messages;

  // PRIORITY-BASED TRUNCATION:
  // 1. System messages (memory context) are included FIRST (guaranteed)
  // 2. Most recent user/assistant messages fill remaining budget (last-to-first)
  // This prevents long conversations from silently dropping cross-chat memory.

  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const kept: { role: "user" | "assistant" | "system"; content: string }[] = [];
  let usedTokens = 0;

  // Phase 1: Include system messages (memory/context) with a budget cap of 40%
  const systemBudget = Math.floor(maxTokens * 0.4);
  for (const msg of systemMessages) {
    const msgTokens = estimateTokens(msg.content);
    if (usedTokens + msgTokens <= systemBudget) {
      kept.push(msg);
      usedTokens += msgTokens;
    } else if (usedTokens < systemBudget) {
      // Truncate system message to fit remaining system budget
      const remaining = systemBudget - usedTokens;
      const truncated = truncateToTokenBudget(msg.content, remaining);
      if (truncated.trim()) {
        kept.push({ role: "system", content: truncated });
        usedTokens += estimateTokens(truncated);
      }
    }
  }

  // Phase 2: Fill remaining budget with non-system messages (most recent first)
  const conversationKept: { role: "user" | "assistant" | "system"; content: string }[] = [];
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const msgTokens = estimateTokens(msg.content);

    if (usedTokens + msgTokens <= maxTokens) {
      conversationKept.push(msg);
      usedTokens += msgTokens;
      continue;
    }

    // Guarantee at least the latest message survives even if oversized.
    if (conversationKept.length === 0) {
      const remaining = Math.max(64, maxTokens - usedTokens);
      const truncated = truncateToTokenBudget(msg.content, remaining);
      if (truncated.trim()) {
        conversationKept.push({ role: msg.role as "user" | "assistant" | "system", content: truncated });
      }
    }

    if (usedTokens >= maxTokens) break;
  }

  // Assemble: system messages first, then conversation in chronological order
  return [...kept, ...conversationKept.reverse()];
}

// ─── Stop Words ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "don", "now", "i", "me", "my", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "it", "its", "they", "them", "their",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "am", "but", "if", "or", "because", "until", "while", "about",
  "like", "also", "well", "really", "know", "think", "want", "get",
  "make", "go", "see", "come", "take", "use", "find", "give", "tell",
  "say", "try", "keep", "let", "help", "show", "turn", "play",
]);

// ─── Text Processing ─────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function extractEntities(text: string): string[] {
  const entities: string[] = [];
  
  // 1. Capitalized words (Potential entities/classes)
  const capitalizedPattern = /\b[A-Z][a-z]{2,}\b/g;
  entities.push(...(text.match(capitalizedPattern) || []).map(c => c.toLowerCase()));
  
  // 2. Technical identifiers (camelCase, snake_case, etc.)
  const techPattern = /\b(?:[a-z]+[A-Z][a-zA-Z0-9]*|[a-z]+[a-z0-9]*_[a-z0-9_]+|[a-zA-Z]+[0-9]+[a-zA-Z]*)\b/g;
  entities.push(...(text.match(techPattern) || []).map(t => t.toLowerCase()));
  
  // 3. Code patterns (functions, variables from snippets)
  const codeIdentPattern = /\b(?:function|class|const|let|var|interface|type|async)\s+([a-zA-Z0-9_$]+)/g;
  let match;
  while ((match = codeIdentPattern.exec(text)) !== null) {
    if (match[1]) entities.push(match[1].toLowerCase());
  }
  
  // 4. Backticks and quotes
  const codePattern = /`([^`]+)`/g;
  while ((match = codePattern.exec(text)) !== null) entities.push(match[1].toLowerCase().trim());
  const quotePattern = /"([^"]{3,50})"/g;
  while ((match = quotePattern.exec(text)) !== null) entities.push(match[1].toLowerCase().trim());
  
  return [...new Set(entities)].filter(e => e.length > 2);
}

// ─── Semantic Chunking ───────────────────────────────────────────────

interface Chunk {
  content: string;
  tokens: number;
  sourceIndex: number;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  type?: "text" | "table" | "code" | "list";
}

function computeAdaptiveMemoryFragments(query: string, baseMax: number, corpusSize: number): number {
  let target = baseMax;

  if (corpusSize > 500) target += 6;
  else if (corpusSize > 250) target += 4;
  else if (corpusSize > 100) target += 2;

  if (/\b(all|everything|full|complete|entire|exhaustive|deep|across|history|long context|unlimited)\b/i.test(query)) {
    target += 4;
  }

  if (query.length > 180) target += 2;

  return Math.max(baseMax, Math.min(36, target));
}

function chunkMessage(msg: { content: string; role: "user" | "assistant" | "system"; timestamp: Date; index: number }, maxTokens: number): Chunk[] {
  const tokens = estimateTokens(msg.content);
  if (tokens <= maxTokens) {
    return [{ content: msg.content, tokens, sourceIndex: msg.index, role: msg.role, timestamp: msg.timestamp, type: detectContentType(msg.content) }];
  }

  // Detect structure for adaptive chunking
  const markdownTablePattern = /\|.*\|\s*\n\s*\|?\s*[:-]+(?:\s*\|\s*[:-]+)+\s*\|?\s*(?:\n|$)/m;
  const isTable = markdownTablePattern.test(msg.content);
  const isCSV = msg.content.includes(",") && (msg.content.match(/\n/g) || []).length > 5;
  
  if (isTable || isCSV) {
    return chunkTabularData(msg, maxTokens);
  }

  // Split on paragraph boundaries, then sentence boundaries
  const paragraphs = msg.content.split(/\n{2,}/);
  const chunks: Chunk[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    // If a single paragraph is too large, split by sentences
    if (paraTokens > maxTokens) {
      if (currentChunk) {
        chunks.push({ content: currentChunk.trim(), tokens: estimateTokens(currentChunk), sourceIndex: msg.index, role: msg.role, timestamp: msg.timestamp, type: "text" });
        currentChunk = "";
      }
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sent of sentences) {
        if (estimateTokens(currentChunk + " " + sent) > maxTokens && currentChunk) {
          chunks.push({ content: currentChunk.trim(), tokens: estimateTokens(currentChunk), sourceIndex: msg.index, role: msg.role, timestamp: msg.timestamp, type: "text" });
          currentChunk = sent;
        } else {
          currentChunk += (currentChunk ? " " : "") + sent;
        }
      }
    } else if (estimateTokens(currentChunk + "\n\n" + para) > maxTokens && currentChunk) {
      chunks.push({ content: currentChunk.trim(), tokens: estimateTokens(currentChunk), sourceIndex: msg.index, role: msg.role, timestamp: msg.timestamp, type: "text" });
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }
  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), tokens: estimateTokens(currentChunk), sourceIndex: msg.index, role: msg.role, timestamp: msg.timestamp, type: "text" });
  }
  return chunks;
}

function detectContentType(text: string): "text" | "table" | "code" | "list" {
  if (/\|.*\|\s*\n\s*\|?\s*[:-]+(?:\s*\|\s*[:-]+)+\s*\|?/m.test(text)) return "table";
  if (text.includes("```")) return "code";
  if (/^\s*[-*•]\s+/m.test(text)) return "list";
  return "text";
}

function chunkTabularData(msg: { content: string; role: "user" | "assistant" | "system"; timestamp: Date; index: number }, maxTokens: number): Chunk[] {
  const lines = msg.content.split("\n");
  const hasSeparator = lines.length > 1 && /^\s*\|?\s*[:-]+(?:\s*\|\s*[:-]+)+\s*\|?\s*$/.test(lines[1]);
  const header = hasSeparator ? `${lines[0]}\n${lines[1]}` : lines[0];
  const rowStart = hasSeparator ? 2 : 1;
  const chunks: Chunk[] = [];
  let currentRows = "";
  
  // Skip header for rows
  for (let i = rowStart; i < lines.length; i++) {
    const row = lines[i];
    if (estimateTokens(header + "\n" + currentRows + "\n" + row) > maxTokens && currentRows) {
      chunks.push({ 
        content: header + "\n" + currentRows.trim(), 
        tokens: estimateTokens(header + "\n" + currentRows), 
        sourceIndex: msg.index, 
        role: msg.role, 
        timestamp: msg.timestamp,
        type: "table"
      });
      currentRows = row;
    } else {
      currentRows += (currentRows ? "\n" : "") + row;
    }
  }
  
  if (currentRows) {
    chunks.push({ 
      content: header + "\n" + currentRows.trim(), 
      tokens: estimateTokens(header + "\n" + currentRows), 
      sourceIndex: msg.index, 
      role: msg.role, 
      timestamp: msg.timestamp,
      type: "table"
    });
  }
  
  return chunks;
}

// ─── Inverted Index ──────────────────────────────────────────────────

interface InvertedIndex {
  postings: Map<string, Set<number>>; // term → chunk indices
  chunkLengths: number[]; // word counts per chunk
  avgLength: number;
  totalChunks: number;
  entityIndex: Map<string, Set<number>>; // entity → chunk indices
  entityGraph: Map<string, Map<string, number>>;
}

function buildInvertedIndex(chunks: Chunk[]): InvertedIndex {
  const postings = new Map<string, Set<number>>();
  const entityIndex = new Map<string, Set<number>>();
  const entityGraph = new Map<string, Map<string, number>>();
  const chunkLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < chunks.length; i++) {
    const words = tokenize(chunks[i].content);
    chunkLengths.push(words.length);
    totalLength += words.length;

    const seen = new Set<string>();
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        if (!postings.has(w)) postings.set(w, new Set());
        postings.get(w)!.add(i);
      }
    }

    // Index entities
    const entities = extractEntities(chunks[i].content);
    for (const e of entities) {
      if (!entityIndex.has(e)) entityIndex.set(e, new Set());
      entityIndex.get(e)!.add(i);
    }

    if (entities.length > 1) {
      for (let a = 0; a < entities.length - 1; a++) {
        const ea = entities[a];
        let adj = entityGraph.get(ea);
        if (!adj) {
          adj = new Map();
          entityGraph.set(ea, adj);
        }
        for (let b = a + 1; b < entities.length; b++) {
          const eb = entities[b];
          adj.set(eb, (adj.get(eb) || 0) + 1);
          let adjB = entityGraph.get(eb);
          if (!adjB) {
            adjB = new Map();
            entityGraph.set(eb, adjB);
          }
          adjB.set(ea, (adjB.get(ea) || 0) + 1);
        }
      }
    }
  }

  return {
    postings,
    chunkLengths,
    avgLength: chunks.length > 0 ? totalLength / chunks.length : 0,
    totalChunks: chunks.length,
    entityIndex,
    entityGraph,
  };
}

function expandQueryFromEntityGraph(
  query: string,
  queryTerms: string[],
  queryEntities: string[],
  index: InvertedIndex,
  opts?: { maxEntities?: number; maxTokens?: number; hops?: number }
): { terms: string[]; entities: string[]; semanticQuery: string } {
  const maxEntities = opts?.maxEntities ?? 8;
  const maxTokens = opts?.maxTokens ?? 10;
  const hops = opts?.hops ?? 2;

  if (queryEntities.length === 0) {
    return { terms: queryTerms, entities: queryEntities, semanticQuery: query };
  }

  const neighborScores = new Map<string, number>();
  const visited = new Set<string>(queryEntities);
  let currentFrontier = [...queryEntities];

  for (let h = 0; h < hops; h++) {
    const nextFrontier: string[] = [];
    for (const e of currentFrontier) {
      const adj = index.entityGraph.get(e);
      if (!adj) continue;
      for (const [n, w] of adj.entries()) {
        if (visited.has(n)) continue;
        if (!index.entityIndex.has(n)) continue;

        // Decay weight with distance
        const effectiveWeight = w / (h + 1);
        neighborScores.set(n, (neighborScores.get(n) || 0) + effectiveWeight);
        nextFrontier.push(n);
        visited.add(n);
      }
    }
    currentFrontier = nextFrontier;
    if (currentFrontier.length === 0) break;
  }

  if (neighborScores.size === 0) {
    return { terms: queryTerms, entities: queryEntities, semanticQuery: query };
  }

  const neighbors = [...neighborScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntities)
    .map(([n]) => n);

  const expandedEntities = [...new Set([...queryEntities, ...neighbors])];

  const expandedTermsSet = new Set(queryTerms);
  for (const n of neighbors) {
    const tks = tokenize(n);
    for (const t of tks) {
      if (!index.postings.has(t)) continue;
      expandedTermsSet.add(t);
      if (expandedTermsSet.size >= queryTerms.length + maxTokens) break;
    }
    if (expandedTermsSet.size >= queryTerms.length + maxTokens) break;
  }

  const expandedTerms = [...expandedTermsSet];
  const semanticQuery = neighbors.length > 0 ? `${query}\nRelated context: ${neighbors.join(", ")}` : query;

  return { terms: expandedTerms, entities: expandedEntities, semanticQuery };
}

// ─── Intent-based Weighting ──────────────────────────────────────────

interface SearchWeights {
  semantic: number;
  keyword: number;
  entity: number;
  recency: number;
  ngram: number;
}

function getIntentWeights(query: string): SearchWeights {
  const isCodeQuery = /\b(code|function|fix|bug|refactor|error|issue|implement|write|use|const|let|var|class|interface|type)\b/i.test(query);
  const isQuestion = /\b(what|how|why|explain|describe|who|when|where)\b/i.test(query);
  const isRecentQuery = /\b(recent|lately|today|yesterday|just|now|earlier)\b/i.test(query);
  const isConceptual = /\b(architecture|design|pattern|concept|idea|strategy|goal|mission)\b/i.test(query);
  const isMemoryRecall = isMemoryRecallQuery(query);

  // Default balanced weights
  let weights: SearchWeights = {
    semantic: 0.35,
    keyword: 0.25,
    entity: 0.20,
    recency: 0.10,
    ngram: 0.10
  };

  if (isCodeQuery) {
    // Code queries benefit from exact keyword and entity matching
    weights = { semantic: 0.25, keyword: 0.40, entity: 0.25, recency: 0.05, ngram: 0.05 };
  } else if (isMemoryRecall) {
    // Recall queries should bias semantic bridges and recently mentioned context.
    weights = { semantic: 0.45, keyword: 0.15, entity: 0.20, recency: 0.15, ngram: 0.05 };
  } else if (isConceptual || isQuestion) {
    // Conceptual or broad questions benefit from semantic search
    weights = { semantic: 0.55, keyword: 0.15, entity: 0.15, recency: 0.10, ngram: 0.05 };
  } else if (isRecentQuery) {
    // Recency-biased queries
    weights = { semantic: 0.30, keyword: 0.15, entity: 0.15, recency: 0.35, ngram: 0.05 };
  }

  return weights;
}

// ─── BM25 Scoring ────────────────────────────────────────────────────

function bm25Score(
  queryTerms: string[],
  chunkIndex: number,
  index: InvertedIndex,
  k1: number,
  b: number
): number {
  let score = 0;
  const dl = index.chunkLengths[chunkIndex] || 0;
  const avgdl = index.avgLength || 1;
  const N = index.totalChunks;

  for (const term of queryTerms) {
    const postingList = index.postings.get(term);
    if (!postingList || !postingList.has(chunkIndex)) continue;

    const df = postingList.size;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    // TF within chunk (count occurrences)
    const tf = 1; // Binary presence for speed; could count for precision
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgdl)));

    score += idf * tfNorm;
  }

  return score;
}

// ─── Parallel Search Lanes ───────────────────────────────────────────

interface SearchLaneResult {
  name: string;
  chunkIndices: number[];
  scores: Map<number, number>;
  timeMs: number;
}

interface CrossSessionIndexCacheEntry {
  key: string;
  chunks: Chunk[];
  preTokenized?: (string[] | undefined)[];
  index: InvertedIndex;
  semanticIndex: SemanticIndex;
}

const CROSS_SESSION_CACHE_LIMIT = 8;
const crossSessionIndexCache = new Map<string, CrossSessionIndexCacheEntry>();
const MAX_MEMORY_FRAGMENT_CHARS = 520;
const MAX_MEMORY_CONTEXT_LINES = 14;

function sanitizeMemorySnippet(content: string): string {
  return content
    .replace(/[^\x20-\x7E\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MEMORY_FRAGMENT_CHARS);
}

function normalizeQueryFingerprint(query: string): string {
  return query
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMemoryRecallQuery(query: string): boolean {
  return /\b(remember|remembered|recall|previous|before|last time|what did we|what have we|related to|connected to|context|history)\b/i.test(normalizeQueryFingerprint(query));
}

function normalizeMemoryFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function normalizeKnowledgeFactScore(fact: any, maxScore: number): number {
  const rawScore = typeof fact?._score === "number" ? fact._score : 0;
  if (!Number.isFinite(rawScore) || rawScore <= 0) return 0.55;

  const ratio = rawScore / Math.max(maxScore, rawScore, 1);
  const confidence = typeof fact?.confidence === "number" ? fact.confidence : 0.8;

  return Math.min(1, 0.5 + ratio * 0.35 + Math.min(0.1, Math.max(0, confidence) * 0.1));
}

function buildCrossSessionConversationCacheKey(conversations: Conversation[], chunkMaxTokens: number): string {
  const parts: string[] = [String(chunkMaxTokens)];
  for (const conv of conversations) {
    const first = conv.messages[0];
    const last = conv.messages[conv.messages.length - 1];
    const middle = conv.messages[Math.floor(conv.messages.length / 2)];
    const firstTs = first?.timestamp ? new Date(first.timestamp).getTime() : 0;
    const middleTs = middle?.timestamp ? new Date(middle.timestamp).getTime() : 0;
    const lastTs = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
    const firstHash = first ? simpleHash(getActiveContent(first)) : 0;
    const middleHash = middle ? simpleHash(getActiveContent(middle)) : 0;
    const lastHash = last ? simpleHash(getActiveContent(last)) : 0;
    const totalChars = conv.messages.reduce((sum, message) => sum + getActiveContent(message).length, 0);
    parts.push(`${conv.id}:${conv.messages.length}:${totalChars}:${firstTs}:${middleTs}:${lastTs}:${firstHash}:${middleHash}:${lastHash}`);
  }
  return parts.join("|");
}

/** Lane 1: BM25 keyword search — fast via inverted index */
function keywordSearchLane(queryTerms: string[], index: InvertedIndex, config: ContextConfig): SearchLaneResult {
  const start = performance.now();
  const candidateIndices = new Set<number>();

  // Only scan chunks that contain at least one query term (inverted index lookup)
  for (const term of queryTerms) {
    const postings = index.postings.get(term);
    if (postings) postings.forEach(i => candidateIndices.add(i));
  }

  const scores = new Map<number, number>();
  for (const idx of candidateIndices) {
    const score = bm25Score(queryTerms, idx, index, config.bm25k1, config.bm25b);
    if (score > 0) scores.set(idx, score);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return {
    name: "Keyword (BM25)",
    chunkIndices: sorted.map(([i]) => i),
    scores,
    timeMs: performance.now() - start,
  };
}

/** Lane 2: Entity matching search */
function entitySearchLane(queryEntities: string[], index: InvertedIndex): SearchLaneResult {
  const start = performance.now();
  const scores = new Map<number, number>();

  for (const entity of queryEntities) {
    const postings = index.entityIndex.get(entity);
    if (postings) {
      for (const idx of postings) {
        scores.set(idx, (scores.get(idx) || 0) + 1);
      }
    }
  }

  // Normalize by query entity count
  if (queryEntities.length > 0) {
    for (const [idx, count] of scores) {
      scores.set(idx, count / queryEntities.length);
    }
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return {
    name: "Entity Match",
    chunkIndices: sorted.map(([i]) => i),
    scores,
    timeMs: performance.now() - start,
  };
}

/** Lane 3: Recency-biased search — boosts recent chunks */
function recencySearchLane(chunks: Chunk[], queryTerms: string[], preTokenized?: (string[] | undefined)[], startIndex: number = 0): SearchLaneResult {
  const start = performance.now();
  const scores = new Map<number, number>();
  const querySet = new Set(queryTerms);

  for (let i = startIndex; i < chunks.length; i++) {
    const words = preTokenized?.[i] ?? tokenize(chunks[i].content);
    const overlap = words.filter(w => querySet.has(w)).length;
    if (overlap === 0) continue;

    // Recency boost: higher index = more recent = higher score
    const recencyWeight = 0.5 + 0.5 * (i / Math.max(chunks.length - 1, 1));
    const overlapScore = overlap / Math.max(queryTerms.length, 1);
    scores.set(i, overlapScore * recencyWeight);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return {
    name: "Recency-biased",
    chunkIndices: sorted.map(([i]) => i),
    scores,
    timeMs: performance.now() - start,
  };
}

/** Lane 4: N-gram overlap search for phrase matching */
function ngramSearchLane(chunks: Chunk[], queryTerms: string[], preTokenized?: (string[] | undefined)[], startIndex: number = 0): SearchLaneResult {
  const start = performance.now();
  const scores = new Map<number, number>();
  
  const getNgrams = (words: string[], n: number): Set<string> => {
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) ngrams.add(words.slice(i, i + n).join("_"));
    return ngrams;
  };

  const q2 = getNgrams(queryTerms, 2);
  const q3 = getNgrams(queryTerms, 3);

  for (let i = startIndex; i < chunks.length; i++) {
    const words = preTokenized?.[i] ?? tokenize(chunks[i].content);
    let score = 0;
    if (q2.size > 0) {
      const m2 = getNgrams(words, 2);
      let hits = 0;
      for (const ng of q2) if (m2.has(ng)) hits++;
      score += (hits / q2.size) * 0.4;
    }
    if (q3.size > 0) {
      const m3 = getNgrams(words, 3);
      let hits = 0;
      for (const ng of q3) if (m3.has(ng)) hits++;
      score += (hits / q3.size) * 0.6;
    }
    if (score > 0) scores.set(i, score);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return {
    name: "N-gram Phrase",
    chunkIndices: sorted.map(([i]) => i),
    scores,
    timeMs: performance.now() - start,
  };
}

// ─── Reciprocal Rank Fusion ─────────────────────────────────────────

function reciprocalRankFusion(
  lanes: SearchLaneResult[],
  weights: number[],
  k: number = 60
): Map<number, number> {
  const fusedScores = new Map<number, number>();

  for (let l = 0; l < lanes.length; l++) {
    const weight = weights[l] || 1;
    const ranked = lanes[l].chunkIndices;
    for (let rank = 0; rank < ranked.length; rank++) {
      const idx = ranked[rank];
      const rrfScore = weight / (k + rank + 1);
      fusedScores.set(idx, (fusedScores.get(idx) || 0) + rrfScore);
    }
  }

  return fusedScores;
}

// ─── Query Complexity Analysis ───────────────────────────────────────

function analyzeQueryComplexity(query: string): {
  complexity: "simple" | "moderate" | "complex";
  tokenBudgetMultiplier: number;
  recentWindowBoost: number;
} {
  const words = query.split(/\s+/).length;
  const hasQuestionWords = /\b(what|how|why|explain|describe|compare|analyze|discuss)\b/i.test(query);
  const hasMultipleTopics = (query.match(/\b(and|also|plus|additionally|moreover)\b/gi) || []).length;
  const hasReferenceWords = /\b(earlier|before|previous|mentioned|said|discussed|told)\b/i.test(query);

  let score = 0;
  if (words > 20) score += 2; else if (words > 10) score += 1;
  if (hasQuestionWords) score += 1;
  if (hasMultipleTopics > 0) score += hasMultipleTopics;
  if (hasReferenceWords) score += 2;

  if (score >= 4) return { complexity: "complex", tokenBudgetMultiplier: 1.3, recentWindowBoost: 4 };
  if (score >= 2) return { complexity: "moderate", tokenBudgetMultiplier: 1.1, recentWindowBoost: 2 };
  return { complexity: "simple", tokenBudgetMultiplier: 1.0, recentWindowBoost: 0 };
}

// ─── Recursive Summarization ─────────────────────────────────────────

function summarizeMessageGroup(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  level: "recent" | "mid" | "archive"
): string {
  if (messages.length === 0) return "";

  const topics = new Map<string, number>();
  const userIntents: string[] = [];
  const keyDecisions: string[] = [];

  for (const msg of messages) {
    for (const kw of tokenize(msg.content)) topics.set(kw, (topics.get(kw) || 0) + 1);
    if (msg.role === "user") {
      const first = msg.content.split(/[.!?]/)[0]?.trim();
      if (first && first.length > 10) userIntents.push(first.slice(0, 100));
    }
    if (msg.role === "assistant") {
      const cm = msg.content.match(/(?:in summary|therefore|the key|important|conclusion)[^.]*\./i);
      if (cm) keyDecisions.push(cm[0].trim().slice(0, 120));
    }
  }

  const topTopics = [...topics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, level === "archive" ? 8 : 12)
    .map(([w]) => w);

  const parts = [
    `[${level === "archive" ? "Archived" : level === "mid" ? "Earlier" : "Recent"} summary — ${messages.length} messages]`,
    `Key topics: ${topTopics.join(", ")}`,
  ];
  const recentIntents = userIntents.slice(-(level === "archive" ? 2 : 4));
  if (recentIntents.length > 0) parts.push(`User discussed:\n${recentIntents.map(q => `• ${q}`).join("\n")}`);
  if (keyDecisions.length > 0) parts.push(`Key points:\n${keyDecisions.slice(0, 3).map(d => `• ${d}`).join("\n")}`);
  return parts.join("\n");
}

// ─── Cross-Session Memory Search (Indexed) ───────────────────────────

function searchMemoriesIndexed(
  query: string,
  conversations: Conversation[],
  currentConvId: string | null,
  config: ContextConfig,
  emotionalState?: { primaryEmotion: string; emotionalTone: string; empathyLevel: number }
): { memories: MemoryFragment[]; metrics: SearchLaneResult[] } {
  const otherConvs = conversations.filter(c => c.id !== currentConvId);
  if (otherConvs.length === 0) return { memories: [], metrics: [] };

  const cacheKey = buildCrossSessionConversationCacheKey(otherConvs, config.chunkMaxTokens);
  const cached = crossSessionIndexCache.get(cacheKey);

  let allChunks: Chunk[] = [];
  let preTokenized: (string[] | undefined)[] | undefined;
  let index: InvertedIndex;
  let semanticIndex: SemanticIndex;

  if (cached) {
    crossSessionIndexCache.delete(cacheKey);
    crossSessionIndexCache.set(cacheKey, cached);
    allChunks = cached.chunks;
    preTokenized = cached.preTokenized;
    index = cached.index;
    semanticIndex = cached.semanticIndex;
  } else {
    const builtChunks: Chunk[] = [];
    let msgIndex = 0;
    for (const conv of otherConvs) {
      for (const msg of conv.messages) {
        const chunks = chunkMessage(
          { content: getActiveContent(msg), role: msg.role, timestamp: msg.timestamp, index: msgIndex++ },
          config.chunkMaxTokens
        );
        builtChunks.push(...chunks);
      }
    }

    if (builtChunks.length === 0) return { memories: [], metrics: [] };

    allChunks = builtChunks;
    const recencyStart = Math.max(0, allChunks.length - 900);
    const pt: (string[] | undefined)[] = new Array(allChunks.length);
    for (let i = recencyStart; i < allChunks.length; i++) pt[i] = tokenize(allChunks[i].content);
    preTokenized = pt;

    index = buildInvertedIndex(allChunks);
    semanticIndex = buildSemanticIndex(allChunks.map((c, i) => ({ content: c.content, timestamp: c.timestamp, sourceIndex: i })));

    crossSessionIndexCache.set(cacheKey, { key: cacheKey, chunks: allChunks, preTokenized, index, semanticIndex });
    if (crossSessionIndexCache.size > CROSS_SESSION_CACHE_LIMIT) {
      const oldestKey = crossSessionIndexCache.keys().next().value;
      if (oldestKey) crossSessionIndexCache.delete(oldestKey);
    }
  }

  const now = Date.now();
  const adaptiveMaxFragments = computeAdaptiveMemoryFragments(query, config.maxMemoryFragments, allChunks.length);
  const memoryRecallQuery = isMemoryRecallQuery(query);

  const queryTerms = tokenize(query);
  const queryEntities = extractEntities(query);
  const expanded = expandQueryFromEntityGraph(query, queryTerms, queryEntities, index, {
    maxEntities: memoryRecallQuery ? 12 : 8,
    maxTokens: memoryRecallQuery ? 14 : 10,
    hops: memoryRecallQuery ? 3 : 2,
  });

  // If emotionalState is provided, create an emotionally-biased query for semantic matching
  const emotionalQuery = emotionalState 
    ? `${query} (Search for ${emotionalState.primaryEmotion} / ${emotionalState.emotionalTone} resonance)`
    : query;
  const semanticQuery = emotionalState ? `${emotionalQuery}\n${expanded.semanticQuery}` : expanded.semanticQuery;

  // Run parallel search lanes
  const lane1 = keywordSearchLane(expanded.terms, index, config);
  const lane2 = entitySearchLane(expanded.entities, index);
  const recencyStart = Math.max(0, allChunks.length - 900);
  const lane3 = recencySearchLane(allChunks, expanded.terms, preTokenized, recencyStart);

  // Lane 4: Semantic Search (using the built semantic index)
  const semanticStart = performance.now();
  const semanticResults = semanticSearch(semanticQuery, semanticIndex, adaptiveMaxFragments * 2);
  const lane4: SearchLaneResult = {
    name: "Semantic Search",
    chunkIndices: semanticResults.map(r => r.chunkIndex),
    scores: new Map(semanticResults.map(r => [r.chunkIndex, r.finalScore])),
    timeMs: performance.now() - semanticStart
  };

  // Lane 5: Knowledge Graph Retrieval (Conceptual bridge)
  const knowledgeStart = performance.now();
  let knowledgeFacts: any[] = [];
  try { knowledgeFacts = getKnowledgeExtractor().query(query, Math.max(8, adaptiveMaxFragments + 2)); } catch { /* no-op for tests */ }
  const maxKnowledgeScore = Math.max(...knowledgeFacts.map((fact: any) => fact._score || 0), 1);

  // Fuse results with dynamic weights
  const intentWeights = getIntentWeights(query);
  // map lanes: lane4=semantic, lane1=keyword, lane2=entity, lane3=recency
  const fusedScores = reciprocalRankFusion(
    [lane4, lane1, lane2, lane3],
    [intentWeights.semantic, intentWeights.keyword, intentWeights.entity, intentWeights.recency]
  );

  // Time decay and code-specific boost
  const scoredChunks = [...fusedScores.entries()]
    .map(([idx, score]) => {
      const chunk = allChunks[idx];
      const ageHours = (now - chunk.timestamp.getTime()) / (1000 * 60 * 60);
      const ageDays = ageHours / 24;
      const decay = Math.pow(config.decayFactor, ageDays);
      
      // Boost for code blocks if the query is code-related
      const isCodeQuery = /\b(code|function|fix|bug|refactor|error|issue|implement|write|use)\b/i.test(query);
      const codeBoost = (isCodeQuery && chunk.type === "code") ? 1.6 : 1.0;
      
      return { idx, score: score * decay * codeBoost };
    })
    .filter(c => c.score > 0.0008) // Slightly lower threshold for better recall
    .sort((a, b) => b.score - a.score)
    .slice(0, adaptiveMaxFragments);

  const memories: any[] = scoredChunks.map(({ idx, score }) => {
    const chunk = allChunks[idx];
    let bestLane: "keyword" | "entity" | "recency" | "semantic" = "keyword"; 
    
    if (lane4.scores.has(idx) && (!lane1.scores.has(idx) || lane4.scores.get(idx)! > lane1.scores.get(idx)!)) {
      bestLane = "semantic";
    } else if (lane2.scores.has(idx)) {
      bestLane = "entity";
    } else if (lane3.scores.has(idx) && score > 0.15) {
      bestLane = "recency";
    }
    
    return {
      content: sanitizeMemorySnippet(chunk.content),
      role: chunk.role,
      relevanceScore: Math.min(1, Math.max(0, score * 14)),
      source: "history" as const,
      timestamp: chunk.timestamp,
      entities: extractEntities(chunk.content),
      matchType: bestLane,
    };
  });

  const knowledgeMemories: MemoryFragment[] = knowledgeFacts.map((k: any) => ({
    content: sanitizeMemorySnippet(`${k.subject} ${k.predicate} ${k.object}`),
    role: "system",
    relevanceScore: normalizeKnowledgeFactScore(k, maxKnowledgeScore),
    source: "history",
    timestamp: new Date(k.timestamp),
    entities: extractEntities(`${k.subject} ${k.predicate} ${k.object}`),
    matchType: "semantic",
  }));

  const combinedMemories: MemoryFragment[] = [...knowledgeMemories, ...memories]
    .sort((a, b) => {
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(scoreDiff) > 0.02) return scoreDiff;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

  const dedupedMemories: MemoryFragment[] = [];
  const seenFragments = new Set<string>();
  for (const fragment of combinedMemories) {
    const fingerprint = normalizeMemoryFingerprint(fragment.content);
    if (seenFragments.has(fingerprint)) continue;
    seenFragments.add(fingerprint);
    dedupedMemories.push(fragment);
  }

  const lane5: SearchLaneResult = {
    name: "Knowledge Graph",
    chunkIndices: knowledgeFacts.map((_: any, idx: number) => idx),
    scores: new Map(knowledgeFacts.map((f: any, idx: number) => [idx, normalizeKnowledgeFactScore(f, maxKnowledgeScore)])),
    timeMs: performance.now() - knowledgeStart
  };

  return { memories: dedupedMemories.slice(0, adaptiveMaxFragments + 2), metrics: [lane1, lane2, lane3, lane4, lane5] };
}

import { buildSemanticIndex, semanticSearch, type SemanticIndex } from "./semanticSearch";

// ─── Brain Memory Cache ─────────────────────────────────────────────

/**
 * Session-based Brain Memory Cache
 * 
 * Stores pre-built indices for active conversations to avoid redundant
 * processing and enable "first-pass" instant searching.
 */
interface BrainMemory {
  index: InvertedIndex;
  semanticIndex: SemanticIndex;
  chunks: Chunk[];
  lastUpdated: number;
  fingerprint: number;
}

/** Fast string hash for cache invalidation — uses full content */
function simpleHash(str: string): number {
  let hash = 0;
  // Sample evenly across the string for large content instead of just first 200 chars
  const step = str.length > 1000 ? Math.floor(str.length / 500) : 1;
  for (let i = 0; i < str.length; i += step) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  // Also incorporate the length to differentiate truncated vs full content
  hash = ((hash << 5) - hash + str.length) | 0;
  return hash;
}

const brainMemoryCache = new Map<string, BrainMemory>();
const BRAIN_MEMORY_CACHE_LIMIT = 10;
const BRAIN_MEMORY_CACHE_TTL_MS = 20 * 60 * 1000;

function trimBrainMemoryCache() {
  while (brainMemoryCache.size > BRAIN_MEMORY_CACHE_LIMIT) {
    const oldestKey = brainMemoryCache.keys().next().value;
    if (!oldestKey) break;
    brainMemoryCache.delete(oldestKey);
  }
}

function computeMessagesFingerprint(messages: { role: "user" | "assistant" | "system"; content: string; timestamp: Date; index: number }[]): number {
  let hash = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    hash = ((hash << 5) - hash + (m.role === "user" ? 1 : m.role === "assistant" ? 2 : 3)) | 0;
    hash = ((hash << 5) - hash + m.timestamp.getTime()) | 0;
    hash = ((hash << 5) - hash + m.index) | 0;
    hash = ((hash << 5) - hash + simpleHash(m.content)) | 0;
  }
  hash = ((hash << 5) - hash + messages.length) | 0;
  return hash;
}

function getBrainMemory(convId: string, messages: { role: "user" | "assistant" | "system"; content: string; timestamp: Date; index: number }[]): BrainMemory {
  const cached = brainMemoryCache.get(convId);
  const fingerprint = computeMessagesFingerprint(messages);
  if (
    cached &&
    cached.fingerprint === fingerprint &&
    Date.now() - cached.lastUpdated <= BRAIN_MEMORY_CACHE_TTL_MS
  ) {
    // Keep cache entry hot in LRU order.
    brainMemoryCache.delete(convId);
    brainMemoryCache.set(convId, cached);
    return cached;
  }

  // Build new brain memory
  const chunks = messages.flatMap(m => chunkMessage(m, DEFAULT_CONFIG.chunkMaxTokens));
  const index = buildInvertedIndex(chunks);
  const semanticIndex = buildSemanticIndex(chunks.map((c, i) => ({ content: c.content, timestamp: c.timestamp, sourceIndex: i })));
  
  const memory: BrainMemory = {
    index,
    semanticIndex,
    chunks,
    lastUpdated: Date.now(),
    fingerprint,
  };

  brainMemoryCache.set(convId, memory);
  trimBrainMemoryCache();
  return memory;
}

// ─── Main Context Builder ────────────────────────────────────────────

export function buildContextWindow(
  currentMessages: Message[],
  currentQuery: string,
  conversations: Conversation[],
  currentConvId: string | null,
  configOverrides?: Partial<ContextConfig>,
  userInsights?: string,
  emotionalState?: { primaryEmotion: string; emotionalTone: string; empathyLevel: number }
): ContextWindow {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const buildStart = performance.now();

  const allMessages = currentMessages.map((m, i) => ({
    role: m.role,
    content: getActiveContent(m),
    timestamp: m.timestamp,
    index: i,
  }));

  const totalCount = allMessages.length;
  const queryAnalysis = config.queryComplexityBoost
    ? analyzeQueryComplexity(currentQuery)
    : { complexity: "moderate" as const, tokenBudgetMultiplier: 1, recentWindowBoost: 0 };
  const memoryRecallQuery = isMemoryRecallQuery(currentQuery);

  // Dynamic Token Budgeting based on total message size and content type
  const totalMessageTokens = allMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const isLargeDataset = totalMessageTokens > config.maxTokens * 2;
  const isTabularQuery = /\b(table|csv|data|row|column|count|sum|average|list|statistics)\b/i.test(currentQuery);
  const isDocumentQuery = /\b(document|file|pdf|image|ocr|attachment|statement|bank|read|analyze|pyq|question|module|notes)\b/i.test(currentQuery);

  if (isLargeDataset) {
    queryAnalysis.tokenBudgetMultiplier *= 1.4; // Boost budget for large datasets
    queryAnalysis.recentWindowBoost += 2;
  }
  if (isDocumentQuery || isTabularQuery) {
    queryAnalysis.tokenBudgetMultiplier *= 1.3;
  }
  if (memoryRecallQuery) {
    queryAnalysis.tokenBudgetMultiplier *= 1.12;
    queryAnalysis.recentWindowBoost += 1;
  }

  let tokenBudget = Math.floor(config.maxTokens * queryAnalysis.tokenBudgetMultiplier);
  const recentSize = config.recentWindowSize + queryAnalysis.recentWindowBoost;

  // ── Layer 4: Cross-session memory search (indexed) ──
  let relevantMemories: MemoryFragment[] = [];
  let memoryLaneMetrics: SearchLaneResult[] = [];
  if (config.enableMemorySearch && conversations.length > 1) {
    const result = searchMemoriesIndexed(currentQuery, conversations, currentConvId, config, emotionalState);
    relevantMemories = result.memories;
    memoryLaneMetrics = result.metrics;
  }

  let memoryContext = "";
  if (relevantMemories.length > 0) {
    const memoryLines = relevantMemories.slice(0, MAX_MEMORY_CONTEXT_LINES).map(
      (m, _i) => `<historical_context source="Session history" match_type="${m.matchType || 'unknown'}" score="${(m.relevanceScore * 100).toFixed(0)}%" reasoning="Found via ${m.matchType} matching of entities or semantics">
[${m.role}] ${m.content}
</historical_context>`
    );
    memoryContext = `[Relevant memories from past conversations]\n${memoryLines.join("\n")}`;
    tokenBudget -= estimateTokens(memoryContext);
  }

  // ── Layer 1: Recent window ──
  const recentStart = Math.max(0, allMessages.length - recentSize);
  const recentMessages = allMessages.slice(recentStart);
  const olderMessages = allMessages.slice(0, recentStart);

  const recentTokens = recentMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  tokenBudget -= recentTokens;

  // ── Layer 2 & 3: Parallel search on older messages ──
  const relevantOlder: { role: "user" | "assistant" | "system"; content: string }[] = [];
  let summary: string | null = null;
  let summarizedCount = 0;
  const searchLaneMetrics: { name: string; resultsFound: number; timeMs: number }[] = [];

  if (olderMessages.length > 0) {
    const searchStart = performance.now();
    const adaptiveMaxFragments = computeAdaptiveMemoryFragments(currentQuery, config.maxMemoryFragments, olderMessages.length);

    // Use Brain Memory for first-pass searching if possible
    let brainIndex: InvertedIndex;
    let brainSemanticIndex: SemanticIndex;
    let chunks: Chunk[];

    if (currentConvId) {
      const brain = getBrainMemory(currentConvId, olderMessages);
      brainIndex = brain.index;
      brainSemanticIndex = brain.semanticIndex;
      chunks = brain.chunks;
      searchLaneMetrics.push({ name: "Brain Memory Cache", resultsFound: chunks.length, timeMs: performance.now() - searchStart });
    } else {
      // Fallback: build temporary index
      chunks = olderMessages.flatMap(m => chunkMessage(m, config.chunkMaxTokens));
      brainIndex = buildInvertedIndex(chunks);
      brainSemanticIndex = buildSemanticIndex(chunks.map((c, i) => ({ content: c.content, timestamp: c.timestamp, sourceIndex: i })));
    }

    const queryTerms = tokenize(currentQuery);
    const queryEntities = extractEntities(currentQuery);
    const expanded = expandQueryFromEntityGraph(currentQuery, queryTerms, queryEntities, brainIndex, {
      maxEntities: isMemoryRecallQuery ? 12 : 8,
      maxTokens: isMemoryRecallQuery ? 14 : 10,
      hops: isMemoryRecallQuery ? 3 : 2,
    });

    // Run parallel search lanes using brain memory index
    const lane1 = keywordSearchLane(expanded.terms, brainIndex, config);
    const lane2 = entitySearchLane(expanded.entities, brainIndex);
    const scanStart = Math.max(0, chunks.length - 900);
    const preTokenized: (string[] | undefined)[] = new Array(chunks.length);
    for (let i = scanStart; i < chunks.length; i++) preTokenized[i] = tokenize(chunks[i].content);
    const lane3 = recencySearchLane(chunks, expanded.terms, preTokenized, scanStart);
    const lane4 = ngramSearchLane(chunks, expanded.terms, preTokenized, scanStart);

    // Lane 5: Semantic Search (using cached semantic index)
     const semanticStart = performance.now();
    const semanticResults = semanticSearch(expanded.semanticQuery, brainSemanticIndex, adaptiveMaxFragments * 2);
     const lane5: SearchLaneResult = {
       name: "Semantic Search",
       chunkIndices: semanticResults.map(r => r.chunkIndex),
       scores: new Map(semanticResults.map(r => [r.chunkIndex, r.finalScore])),
       timeMs: performance.now() - semanticStart
     };

    searchLaneMetrics.push(
      { name: lane1.name, resultsFound: lane1.chunkIndices.length, timeMs: lane1.timeMs },
      { name: lane2.name, resultsFound: lane2.chunkIndices.length, timeMs: lane2.timeMs },
      { name: lane3.name, resultsFound: lane3.chunkIndices.length, timeMs: lane3.timeMs },
      { name: lane4.name, resultsFound: lane4.chunkIndices.length, timeMs: lane4.timeMs },
      { name: lane5.name, resultsFound: lane5.chunkIndices.length, timeMs: lane5.timeMs },
    );

    // Fuse with dynamic RRF (weighted: BM25, Semantic, Entity, Recency, N-gram)
    const intentWeights = getIntentWeights(currentQuery);
    const fusedScores = reciprocalRankFusion(
      [lane1, lane5, lane2, lane3, lane4],
      [intentWeights.keyword, intentWeights.semantic, intentWeights.entity, intentWeights.recency, intentWeights.ngram]
    );

    // Adaptive Relevance Threshold based on query complexity
    const dynamicThreshold = queryAnalysis.complexity === "complex" ? config.relevanceThreshold * 0.5 : config.relevanceThreshold;

    // Sort by fused score
    const ranked = [...fusedScores.entries()]
      .sort((a, b) => b[1] - a[1]);

    // Deduplicate by source message index
    const usedSourceIndices = new Set<number>();
    for (const [chunkIdx, score] of ranked) {
      if (score < dynamicThreshold * 0.01) break;
      const chunk = chunks[chunkIdx];
      
      // Boost relevance for specific chunk types based on query
      let typeBoost = 1.0;
      if (isTabularQuery && chunk.type === "table") typeBoost = 1.3;
      if (isDocumentQuery && chunk.type === "text") typeBoost = 1.1;
      
      const effectiveScore = score * typeBoost;
      if (effectiveScore < dynamicThreshold * 0.01) continue;

      if (usedSourceIndices.has(chunk.sourceIndex)) continue;
      
      const tokens = chunk.tokens;
      if (tokenBudget - tokens > 400) {
        relevantOlder.push({ role: chunk.role, content: chunk.content });
        tokenBudget -= tokens;
        usedSourceIndices.add(chunk.sourceIndex);
        if (usedSourceIndices.size >= adaptiveMaxFragments) break;
      }
    }

    const searchTime = performance.now() - searchStart;
    searchLaneMetrics.push({ name: "Fusion + Select", resultsFound: relevantOlder.length, timeMs: searchTime });

    // Use Persistent Conversation Summary (Byteclaw Unlimited Context method)
    const currentConv = currentConvId ? conversations.find(c => c.id === currentConvId) : null;
    if (currentConv?.summary) {
      summary = `[Historical Summary of Prior Conversation]\n${currentConv.summary}`;
      tokenBudget -= estimateTokens(summary);
      summarizedCount = currentConv.lastSummarizedIndex ?? 0;
    } else if (config.enableSummarization) {
      // Fallback to naive keyword summarization if no LLM summary exists yet
      const includedSet = new Set(relevantOlder.map(m => m.content));
      const nonIncluded = olderMessages.filter(m => !includedSet.has(m.content));
      summarizedCount = nonIncluded.length;

      if (nonIncluded.length > 0) {
        if (nonIncluded.length > 20) {
          const mid = Math.floor(nonIncluded.length / 2);
          const archive = summarizeMessageGroup(nonIncluded.slice(0, mid).map(m => ({ role: m.role, content: m.content })), "archive");
          const midSummary = summarizeMessageGroup(nonIncluded.slice(mid).map(m => ({ role: m.role, content: m.content })), "mid");
          summary = `${archive}\n\n${midSummary}`;
        } else {
          summary = summarizeMessageGroup(nonIncluded.map(m => ({ role: m.role, content: m.content })), "mid");
        }
        tokenBudget -= estimateTokens(summary);
      }
    }
  }

  // ── Assemble final messages ──
  const finalMessages: { role: "user" | "assistant" | "system"; content: string }[] = [];
  if (memoryContext) finalMessages.push({ role: "system", content: memoryContext });
  if (summary) finalMessages.push({ role: "system", content: summary });
  finalMessages.push(...relevantOlder.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })));
  finalMessages.push(...recentMessages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })));

  // Use the adjusted total token budget (respecting multipliers) to avoid premature truncation
  // Ensure the final window strictly obeys the configured maxTokens (model hard limit)
  const boundedMessages = enforceContextTokenLimit(finalMessages, Math.max(512, config.maxTokens));
  const totalTokens = boundedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const buildTimeMs = performance.now() - buildStart;

  // Add memory lane metrics
  for (const ml of memoryLaneMetrics) {
    searchLaneMetrics.push({ name: `Memory: ${ml.name}`, resultsFound: ml.chunkIndices.length, timeMs: ml.timeMs });
  }

  const contextLayers: ContextLayerStats = {
    recentMessages: recentMessages.length,
    relevantOlderMessages: relevantOlder.length,
    summarizedMessages: summarizedCount,
    crossSessionMemories: relevantMemories.length,
    estimatedCompression:
      totalCount > 0 ? `${((1 - finalMessages.length / Math.max(totalCount, 1)) * 100).toFixed(0)}%` : "0%",
  };

  return {
    messages: boundedMessages,
    summary,
    totalTokens,
    includedCount: boundedMessages.length,
    totalCount,
    relevantMemories,
    contextLayers,
    searchMetrics: {
      indexBuildTimeMs: buildTimeMs,
      searchTimeMs: searchLaneMetrics.reduce((s, l) => s + l.timeMs, 0),
      candidatesScanned: totalCount,
      candidatesSelected: relevantOlder.length + relevantMemories.length,
      searchLanes: searchLaneMetrics,
    },
    userInsights,
  };
}

/**
 * Get context stats for display in UI and edge function
 */
export function getContextStats(window: ContextWindow) {
  return {
    messagesUsed: window.includedCount,
    totalMessages: window.totalCount,
    estimatedTokens: window.totalTokens,
    hasSummary: !!window.summary,
    memoriesFound: window.relevantMemories.length,
    compressionRatio: window.contextLayers.estimatedCompression,
    layers: window.contextLayers,
    searchMetrics: window.searchMetrics,
  };
}

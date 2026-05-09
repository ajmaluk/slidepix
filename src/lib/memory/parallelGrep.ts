/**
 * Parallel Grep Search Engine — Multi-lane context search
 * 
 * Inspired by PicoClaw's efficient agentic flow:
 * - Parallel search across multiple data stores (brain, memory, chat, OCR, knowledge graph)
 * - Grep-style pattern matching with scoring
 * - Result fusion and deduplication
 * - Streaming results as they arrive
 */

import { getAgentMemoryManager } from "./agentMemory";
import { getKnowledgeExtractor } from "./knowledgeExtractor";

// ─── Types ───────────────────────────────────────────────────────────

export interface GrepResult {
  content: string;
  source: "memory" | "knowledge" | "interaction" | "ocr" | "person" | "preference";
  relevance: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface GrepLaneResult {
  lane: string;
  results: GrepResult[];
  timeMs: number;
  searched: number;
}

export interface ParallelGrepOutput {
  results: GrepResult[];
  lanes: GrepLaneResult[];
  totalSearched: number;
  totalTimeMs: number;
  query: string;
}

interface MemoryRetrievalSnapshot {
  similarInteractions: Awaited<ReturnType<ReturnType<typeof getAgentMemoryManager>["retrieveMemories"]>>["similarInteractions"];
  relevantKnowledge: Awaited<ReturnType<ReturnType<typeof getAgentMemoryManager>["retrieveMemories"]>>["relevantKnowledge"];
}

// ─── Utility ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of",
  "in", "for", "on", "with", "at", "by", "from", "as", "into", "it", "its",
  "i", "me", "my", "you", "your", "he", "she", "they", "we", "this", "that",
  "what", "which", "who", "how", "do", "does", "did", "will", "would", "could",
  "should", "have", "has", "had", "can", "but", "and", "or", "if", "not",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function grepScore(query: string, text: string): number {
  if (!text || !query) return 0;
  const queryTokens = tokenize(query);
  const textTokens = new Set(tokenize(text));
  if (queryTokens.length === 0 || textTokens.size === 0) return 0;

  let hits = 0;
  for (const qt of queryTokens) {
    if (textTokens.has(qt)) hits++;
    // Partial match (prefix)
    else {
      for (const tt of textTokens) {
        if (tt.startsWith(qt) || qt.startsWith(tt)) { hits += 0.5; break; }
      }
    }
  }

  // Exact substring match bonus
  if (text.toLowerCase().includes(query.toLowerCase())) hits += 2;

  return hits / queryTokens.length;
}

function normalizeTextFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprintResult(result: GrepResult): string {
  return [
    result.source,
    normalizeTextFingerprint(result.content).slice(0, 180),
  ].join("::");
}

function sourcePriority(source: GrepResult["source"]): number {
  switch (source) {
    case "interaction":
      return 5;
    case "person":
      return 4;
    case "knowledge":
      return 3;
    case "preference":
      return 2;
    case "memory":
      return 1;
    case "ocr":
      return 1;
    default:
      return 1;
  }
}

function mergeResults(existing: GrepResult, incoming: GrepResult): GrepResult {
  const existingPriority = sourcePriority(existing.source);
  const incomingPriority = sourcePriority(incoming.source);

  if (incoming.relevance > existing.relevance + 0.02) {
    return incoming;
  }

  if (existing.relevance > incoming.relevance + 0.02) {
    return existing;
  }

  if (incoming.timestamp > existing.timestamp) {
    return incomingPriority >= existingPriority ? incoming : existing;
  }

  return existingPriority >= incomingPriority ? existing : incoming;
}

function normalizeKnowledgeRelevance(rawScore: number, maxScore: number, confidence?: number): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0) return 0.5;

  const scoreRatio = rawScore / Math.max(maxScore, rawScore, 1);
  const confidenceBoost = Math.max(0, Math.min(0.15, (confidence ?? 0.8) * 0.15));

  return Math.min(1, 0.5 + scoreRatio * 0.35 + confidenceBoost);
}

// ─── Search Lanes ────────────────────────────────────────────────────

function searchInteractions(snapshot: MemoryRetrievalSnapshot): GrepLaneResult {
  const start = performance.now();
  
  const results: GrepResult[] = snapshot.similarInteractions.map(i => ({
    content: `Q: ${i.query}${i.answer ? `\nA: ${i.answer}` : ""}`,
    source: "interaction" as const,
    relevance: i.similarity,
    timestamp: i.timestamp,
    metadata: { agentId: i.agentId, tags: i.tags },
  }));

  return {
    lane: "Interactions (Memory)",
    results,
    timeMs: performance.now() - start,
    searched: snapshot.similarInteractions.length,
  };
}

function searchKnowledgeBase(query: string, snapshot: MemoryRetrievalSnapshot): GrepLaneResult {
  const start = performance.now();
  const queryTokens = tokenize(query);
  const queryLower = query.toLowerCase();
  
  const results: GrepResult[] = snapshot.relevantKnowledge.map(k => {
    const combined = `${k.topic} ${k.content}`;
    const normalizedCombined = normalizeTextFingerprint(combined);
    let relevance = grepScore(query, combined);

    if (k.topic && (queryLower.includes(k.topic.toLowerCase()) || normalizedCombined.includes(normalizeTextFingerprint(k.topic)))) {
      relevance += 0.3;
    }

    if (queryTokens.length > 0) {
      const overlap = queryTokens.filter((token) => normalizedCombined.includes(token)).length;
      relevance += Math.min(0.35, (overlap / queryTokens.length) * 0.35);
    }

    if (normalizedCombined.includes(normalizeTextFingerprint(query))) {
      relevance += 0.25;
    }

    return {
      content: `[${k.topic}] ${k.content}`,
      source: "knowledge" as const,
      relevance: Math.min(1, relevance),
      timestamp: k.timestamp,
      metadata: { agentId: k.agentId, source: k.source, topic: k.topic },
    };
  });

  return {
    lane: "Knowledge Base",
    results,
    timeMs: performance.now() - start,
    searched: results.length,
  };
}

function searchKnowledgeGraph(query: string): GrepLaneResult {
  const start = performance.now();
  const extractor = getKnowledgeExtractor();
  const results: GrepResult[] = [];
  const queryLower = query.toLowerCase();
  const queryTokens = new Set(tokenize(query));

  // PERSON LOOKUP LANE: Directly check for known people by name in the query
  // This fixes the case where "what does Adam do?" doesn't find Adam because
  // the standard tokenizer strips short/common words.
  const allWords = queryLower.split(/\s+/).filter(w => w.length >= 2);
  for (const word of allWords) {
    const person = extractor.findPerson(word);
    if (person) {
      results.push({
        content: `Known person: ${person.name}. Relationship: ${person.relationships.join(", ")}. Context: ${person.context.slice(-2).join(" | ")}. Mentioned ${person.mentionCount} times.`,
        source: "person" as const,
        relevance: 1.0,
        timestamp: person.lastMentioned,
        metadata: { context: person.context.slice(-3), directLookup: true },
      });
    }
  }

  // Search facts
  const facts = extractor.query(query, 10);
  const maxFactScore = Math.max(...facts.map((fact: any) => fact._score || 0), 1);
  for (const fact of facts) {
    const normalizedScore = normalizeKnowledgeRelevance(fact._score || 0, maxFactScore, fact.confidence);
    results.push({
      content: `${fact.subject} ${fact.predicate} ${fact.object}`,
      source: "knowledge" as const,
      relevance: normalizedScore,
      timestamp: fact.timestamp,
      metadata: { type: fact.type, confidence: fact.confidence, score: fact._score },
    });
  }

  // Search people
  const allPeople = extractor.getAllPeople();
  for (const person of allPeople) {
    const personNameLower = person.name.toLowerCase();
    const personTokens = personNameLower.split(/\s+/);
    const directNameMatch = queryLower.includes(personNameLower) || personTokens.some((token) => queryTokens.has(token));

    if (directNameMatch) {
      results.push({
        content: `Known person: ${person.name}. Relationship: ${person.relationships.join(", ")}. Mentioned ${person.mentionCount} times.`,
        source: "person" as const,
        relevance: 1.0,
        timestamp: person.lastMentioned,
        metadata: { context: person.context.slice(-3) },
      });
    }
  }

  const relationHints = ["friend", "colleague", "brother", "sister", "mentor", "teacher", "partner", "wife", "husband", "neighbor", "roommate", "boss"]
    .filter((hint) => queryLower.includes(hint));

  if (relationHints.length > 0) {
    const hintedPeople = allPeople
      .filter((person) => relationHints.some((hint) => person.relationships.some((relationship) => relationship.includes(hint) || hint.includes(relationship))))
      .sort((a, b) => (b.mentionCount - a.mentionCount) || (b.lastMentioned - a.lastMentioned))
      .slice(0, 3);

    for (const person of hintedPeople) {
      results.push({
        content: `Relevant ${relationHints.join("/")}: ${person.name} (${person.relationships.join(", ")})`,
        source: "person" as const,
        relevance: 0.76,
        timestamp: person.lastMentioned,
        metadata: { context: person.context.slice(-2), inferredBy: "relationship_hint" },
      });
    }
  }

  // Search preferences
  const prefs = extractor.getPreferences();
  for (const [key, value] of prefs) {
    const score = grepScore(query, `${key} ${value}`);
    if (score > 0.2) {
      results.push({
        content: `User preference: ${key} = ${value}`,
        source: "preference" as const,
        relevance: score,
        timestamp: Date.now(),
        metadata: { key },
      });
    }
  }

  return {
    lane: "Knowledge Graph",
    results,
    timeMs: performance.now() - start,
    searched: facts.length + allPeople.length + prefs.size,
  };
}

// ─── Main Parallel Grep Function ─────────────────────────────────────

/**
 * Execute parallel grep-style search across all data stores.
 * Each lane runs independently and results are fused.
 */
export async function parallelGrep(query: string): Promise<ParallelGrepOutput> {
  const start = performance.now();
  const memory = getAgentMemoryManager();
  const snapshot = await memory.retrieveMemories(query);

  // Run all search lanes in parallel
  const [interactionLane, knowledgeLane, graphLane] = await Promise.all([
    Promise.resolve(searchInteractions(snapshot)),
    Promise.resolve(searchKnowledgeBase(query, snapshot)),
    Promise.resolve(searchKnowledgeGraph(query)),
  ]);

  const allLanes = [interactionLane, knowledgeLane, graphLane];

  // Fuse and deduplicate results by semantic fingerprint.
  // Keep the strongest version of each result instead of the first one seen.
  const mergedResults = new Map<string, GrepResult>();

  for (const lane of allLanes) {
    for (const result of lane.results) {
      const key = fingerprintResult(result);
      const current = mergedResults.get(key);
      mergedResults.set(key, current ? mergeResults(current, result) : result);
    }
  }

  const allResults = [...mergedResults.values()];

  // Sort by relevance, then source strength, then recency.
  allResults.sort((a, b) => {
    const scoreDiff = b.relevance - a.relevance;
    if (Math.abs(scoreDiff) > 0.02) return scoreDiff;
    const sourceDiff = sourcePriority(b.source) - sourcePriority(a.source);
    if (sourceDiff !== 0) return sourceDiff;
    return b.timestamp - a.timestamp;
  });

  return {
    results: allResults.slice(0, 20),
    lanes: allLanes,
    totalSearched: allLanes.reduce((s, l) => s + l.searched, 0),
    totalTimeMs: performance.now() - start,
    query,
  };
}

/**
 * Build a context string from parallel grep results for AI consumption
 */
export function grepResultsToContext(output: ParallelGrepOutput): string {
  if (output.results.length === 0) return "";

  const sections: string[] = [`[Cross-Chat Memory — ${output.results.length} relevant items found]`];

  // Group by source
  const bySource = new Map<string, GrepResult[]>();
  for (const r of output.results) {
    const group = bySource.get(r.source) || [];
    group.push(r);
    bySource.set(r.source, group);
  }

  const sourceOrder: GrepResult["source"][] = ["interaction", "person", "knowledge", "preference", "memory", "ocr"];

  const orderedSources = [...bySource.keys()].sort((a, b) => {
    const priorityDiff = sourceOrder.indexOf(a as GrepResult["source"]) - sourceOrder.indexOf(b as GrepResult["source"]);
    if (priorityDiff !== 0) return priorityDiff;
    return a.localeCompare(b);
  });

  for (const source of orderedSources) {
    const results = (bySource.get(source) || []).sort((a, b) => {
      const scoreDiff = b.relevance - a.relevance;
      if (Math.abs(scoreDiff) > 0.02) return scoreDiff;
      return b.timestamp - a.timestamp;
    });

    const label = {
      memory: "📧 Past Interactions",
      knowledge: "📚 Knowledge Base",
      interaction: "💬 Conversation History",
      ocr: "📄 OCR Documents",
      person: "👤 Known People",
      preference: "⭐ User Preferences",
    }[source] || source;

    sections.push(`\n${label}:`);
    for (const r of results.slice(0, 5)) {
      sections.push(`• ${r.content.slice(0, 200)}`);
    }
  }

  return sections.join("\n");
}

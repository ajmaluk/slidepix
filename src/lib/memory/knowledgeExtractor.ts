/**
 * Knowledge Extractor — Extracts structured facts, names, preferences,
 * and relationships from user messages for cross-chat persistence.
 * 
 * Inspired by PicoClaw's efficient extraction pipeline:
 * - Named Entity Recognition (NER) via patterns
 * - Fact triple extraction (subject-relation-object)
 * - Preference detection
 * - Relationship mapping
 */

import { getAgentMemoryManager } from "./agentMemory";
import type { AgentId } from "@/lib/chat";
import { extractEntities } from "@/lib/contextManager";

// ─── Types ───────────────────────────────────────────────────────────

export interface ExtractedFact {
  id: string;
  type: "person" | "preference" | "fact" | "relationship" | "skill" | "opinion" | "location" | "event" | "style" | "sentiment";
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string; // conversationId
  timestamp: number;
  importance: number; // 0.0 to 1.0
  _score?: number; // Internal scoring
}

export interface PersonEntity {
  name: string;
  context: string[];  // snippets where mentioned
  relationships: string[]; // e.g., "friend", "colleague"
  firstMentioned: number;
  lastMentioned: number;
  mentionCount: number;
}

export interface KnowledgeGraph {
  facts: ExtractedFact[];
  people: Map<string, PersonEntity>;
  preferences: Map<string, string>; // category -> preference
  lastUpdated: number;
}

export interface GraphEdge {
  id: string;
  source: string; // factId or personName
  target: string; // factId or personName
  relation: string;
  weight: number;
}

// ─── Patterns ────────────────────────────────────────────────────────

const RELATIONSHIP_TERMS = "friend|brother|sister|colleague|boss|partner|wife|husband|mom|dad|mother|father|teacher|mentor|classmate|roommate|neighbor|cousin|co-worker|coworker";
const NAME_TOKEN = "[A-Z][a-z'’-]+";
const NAME_SEQUENCE = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,2}`;

const NAME_PATTERNS = [
  // SELF-IDENTIFICATION (Higher priority)
  { pattern: new RegExp(`\\b(?:call\\s+me|my\\s+name\\s+is|i['’]?m|i\\s+am)\\s+(${NAME_SEQUENCE})\\b`, "gi"), isSelf: true },
  
  // My friend Adam / my brother is named Vikram
  { pattern: new RegExp(`\\bmy\\s+(${RELATIONSHIP_TERMS})\\s+(?:is\\s+)?(?:named?\\s+|called\\s+|name\\s+is\\s+)?(${NAME_SEQUENCE}(?:\\s+(?:and|&)\\s+${NAME_SEQUENCE})*)`, "gi"), isSelf: false },
  // Directly "My cousin Adam"
  { pattern: new RegExp(`\\bmy\\s+(${RELATIONSHIP_TERMS})\\s+(${NAME_TOKEN})\\b`, "gi"), isSelf: false },
  // Adam is my friend
  { pattern: new RegExp(`\\b(${NAME_SEQUENCE})\\s+is\\s+my\\s+(${RELATIONSHIP_TERMS})\\b`, "gi"), isSelf: false },
  // I know a friend named Adam
  { pattern: new RegExp(`\\b(?:i\\s+know|i\\s+have)\\s+(?:a\\s+)?(?:friend|person)\\s+(?:named?|called)\\s+(${NAME_SEQUENCE})`, "gi"), isSelf: false },
];

const PREFERENCE_PATTERNS = [
  { pattern: /\b(?:I|they|he|she|([A-Z][a-z]+))\s+(?:like|love|enjoy|prefer|use|favor)s?\s+(.{3,100}?)(?:\.|,|!|\?| and |$)/gi, type: "like" as const },
  { pattern: /\b(?:I|they|he|she|([A-Z][a-z]+))\s+(?:hate|dislike|avoid|don't\s+like)s?\s+(.{3,100}?)(?:\.|,|!|\?| and |$)/gi, type: "dislike" as const },
  { pattern: /\b(?:I|they|he|she|([A-Z][a-z]+))\s+(?:always|usually|often)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "habit" as const },
  { pattern: /\b(?:my|his|her|([A-Z][a-z]+)'s)\s+favorite\s+(.{3,100}?)\s+is\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "favorite" as const },
];

const FACT_PATTERNS = [
  // "I work at Google", "Sarah lives in London"
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:recently\s+)?(?:started|joined|moved|is|am|are|works?|lives?|studies?|goes?|attends?|teaches?|manages?|leads?|owns?)\s+(.{3,100}?)(?:\.|,|!|\?| and |$)/gi, type: "fact" as const },
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:have|has)\s+(?:a\s+)?(.{3,100}?)(?:\.|,|!|\?| and |$)/gi, type: "fact" as const },
  { pattern: /\b(?:my|his|her|([A-Z][a-z]+)'s)\s+(?:job|profession|work|career|role)\s+is\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "fact" as const },
  // Learning/studying patterns
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:am\s+)?(?:learning|studying|studying|taking)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "skill" as const },
  // Using technologies
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:am\s+)?(?:using|working with|building with|developing in)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "skill" as const },
  // Location patterns
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:am\s+)?(?:located|based)\s+(?:in|at|from)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "location" as const },
  // Goals and plans
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:want|plan|hope|aim)\s+to\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "fact" as const },
  // Experience patterns
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:have|has)\s+(?:been\s+)?(?:working|building|developing|using|doing)\s+(?:with|in|on)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "skill" as const },
  // Age-related facts
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:am|is|are)\s+(?:a\s+)?(\d+)\s*(?:years?\s+old|y\.?o\.?|age)\b/gi, type: "fact" as const },
  // Education patterns
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:study|studying|studied|went\s+to|graduated|from)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "fact" as const },
  // Career/company patterns
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:work|worked)\s+(?:at|for|in)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "fact" as const },
  // Hobby patterns
  { pattern: /\b(I|he|she|they|[A-Z][a-z]+)\s+(?:do|doing|did|play|playing|enjoy|enjoying)\s+(.{3,100}?)(?:\.|,|!|\?|$)/gi, type: "fact" as const },
];

const STYLE_PATTERNS = [
  { pattern: /\b(?:i\s+like\s+(?:concise|short|brief|direct)\s+responses|keep\s+it\s+short)\b/gi, style: "concise", confidence: 0.9 },
  { pattern: /\b(?:explain\s+in\s+detail|elaborate|give\s+me\s+a\s+full\s+breakdown|comprehensive)\b/gi, style: "elaborate", confidence: 0.9 },
  { pattern: /\b(?:be\s+(?:funny|humorous|witty|sarcastic)|make\s+jokes)\b/gi, style: "humorous", confidence: 0.8 },
  { pattern: /\b(?:be\s+(?:professional|formal|serious))\b/gi, style: "formal", confidence: 0.8 },
  { pattern: /\b(?:use\s+emojis|more\s+emojis)\b/gi, style: "expressive", confidence: 0.8 },
];

const SENTIMENT_PATTERNS = [
  { pattern: /\b(?:i['’]m\s+(?:happy|excited|glad|great|awesome))\b/gi, sentiment: "positive", confidence: 0.7 },
  { pattern: /\b(?:i['’]m\s+(?:sad|upset|angry|frustrated|annoyed|bored))\b/gi, sentiment: "negative", confidence: 0.7 },
  { pattern: /\b(?:this\s+is\s+(?:amazing|cool|great|wonderful|helpful))\b/gi, sentiment: "positive", confidence: 0.8 },
  { pattern: /\b(?:this\s+(?:sucks|is\s+bad|is\s+wrong|doesn['’]t\s+work))\b/gi, sentiment: "negative", confidence: 0.8 },
];

const RELATIONSHIP_MAP: Record<string, string> = {
  friend: "friend",
  brother: "sibling",
  sister: "sibling",
  colleague: "colleague",
  boss: "superior",
  partner: "partner",
  wife: "spouse",
  husband: "spouse",
  mom: "parent",
  dad: "parent",
  mother: "parent",
  father: "parent",
  teacher: "teacher",
  mentor: "mentor",
  classmate: "classmate",
  roommate: "roommate",
  neighbor: "neighbor",
  "co-worker": "colleague",
  coworker: "colleague",
  cousin: "cousin",
};

const INVALID_NAME_WORDS = new Set([
  "the", "this", "that", "these", "those", "there", "here", "friend", "brother", "sister", "cousin",
  "colleague", "boss", "partner", "wife", "husband", "mom", "dad", "mother", "father",
  "teacher", "mentor", "classmate", "roommate", "neighbor", "coworker", "co-worker", "named",
  "called", "name", "is", "am", "are", "was", "were", "have", "has", "had", "new", "job",
  "work", "works", "working", "lives", "live", "at", "in", "to", "for", "with", "and",
  "a", "an", "my", "i", "me", "we", "they", "he", "she", "it", "you", "who", "what", "like", "likes", "love", "loves", "prefer", "prefers", "hates", "hated",
  "again", "today", "yesterday", "tomorrow", "now", "just", "very", "really", "actually", "basically", "literally",
  "something", "someone", "somebody", "anything", "anyone", "anybody", "nothing", "nobody", "everyone", "everybody",
  "everything", "everywhere", "anywhere", "nowhere", "somewhere", "always", "never", "often", "sometimes",
  "perhaps", "maybe", "probably", "possibly", "actually", "definitely", "clearly", "obviously",
]);

const QUERY_STOP_WORDS = new Set([
  ...INVALID_NAME_WORDS,
  "about", "please", "tell", "show", "give", "me", "us", "get", "know", "find",
  "more", "less", "again", "also", "maybe", "like", "need", "want", "help",
]);

function normalizeRelationship(raw: string): string {
  const cleaned = raw.toLowerCase().trim();
  return RELATIONSHIP_MAP[cleaned] || "known_person";
}

function toDisplayName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isLikelyName(raw: string): boolean {
  if (!raw || raw.length < 2) return false;

  const tokens = raw.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0 || tokens.length > 3) return false;

  // A name should usually start with an uppercase letter
  const isTitleCase = tokens.every(token => /^[A-Z]/.test(token));

  const lowerTokens = tokens.map(t => t.toLowerCase());
  if (lowerTokens.some((token) => token.length < 2 || INVALID_NAME_WORDS.has(token))) return false;

  // If it's not title case, be stricter (e.g. must not be a common word)
  // But since we extract via regex that enforces [A-Z], we can be somewhat lenient here
  // except for implicit extraction where we might see lower case.
  return isTitleCase || tokens.length > 1;
}

function splitNameCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/[.!?].*$/, "")
    .split(/\b(?:who|that|which|is|works?|lives?|study|studies|went|goes|got|said|again|at|in|from|for|as|near|with|to|likes?|loves?|prefers?|hates?|hates?)\b/i)[0]
    ?.trim() || "";

  return cleaned
    .split(/\s+(?:and|&)\s+|\s*,\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(isLikelyName)
    .map(toDisplayName);
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(text: string): string[] {
  const base = normalizeText(text)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !QUERY_STOP_WORDS.has(word));

  const entities = extractEntities(text);
  const combined = [...base, ...entities];
  return [...new Set(combined)].slice(0, 28);
}

function factFingerprint(fact: ExtractedFact): string {
  return [
    fact.subject.toLowerCase(),
    fact.type,
    fact.predicate.toLowerCase(),
    normalizeText(fact.object),
  ].join("::");
}

function sentenceHasQueryOverlap(queryTerms: Set<string>, text: string): number {
  if (queryTerms.size === 0) return 0;
  const normalized = normalizeText(text);
  let overlap = 0;
  for (const term of queryTerms) {
    if (term.length < 2) continue;
    if (normalized.includes(term)) overlap++;
  }
  return overlap;
}

// ─── Extractor Class ────────────────────────────────────────────────

export class KnowledgeExtractor {
  private graph: KnowledgeGraph;
  private edges: GraphEdge[] = [];
  private static STORAGE_KEY = "dalam-knowledge-graph";
  private static EDGES_STORAGE_KEY = "dalam-knowledge-graph-edges";

  constructor() {
    this.graph = this.loadGraph();
    this.edges = this.loadEdges();
  }

  private loadGraph(): KnowledgeGraph {
    try {
      if (typeof localStorage === 'undefined') {
        return { facts: [], people: new Map(), preferences: new Map(), lastUpdated: Date.now() };
      }
      const raw = localStorage.getItem(KnowledgeExtractor.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          facts: parsed.facts || [],
          people: new Map(Object.entries(parsed.people || {})),
          preferences: new Map(Object.entries(parsed.preferences || {})),
          lastUpdated: parsed.lastUpdated || Date.now(),
        };
      }
    } catch (e) {
      console.warn("Failed to load knowledge graph:", e);
    }
    return { facts: [], people: new Map(), preferences: new Map(), lastUpdated: Date.now() };
  }

  private loadEdges(): GraphEdge[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(KnowledgeExtractor.EDGES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveGraph(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const serializable = {
        facts: this.graph.facts,
        people: Object.fromEntries(this.graph.people),
        preferences: Object.fromEntries(this.graph.preferences),
        lastUpdated: this.graph.lastUpdated,
      };
      localStorage.setItem(KnowledgeExtractor.STORAGE_KEY, JSON.stringify(serializable));
      localStorage.setItem(KnowledgeExtractor.EDGES_STORAGE_KEY, JSON.stringify(this.edges));
    } catch (e) {
      console.warn("Failed to save knowledge graph:", e);
    }
  }

  /**
   * Register or update a person in the knowledge graph
   */
  private registerPerson(name: string, relationship: string, context: string, timestamp: number): void {
    const normalizedName = name.toLowerCase().trim();
    const displayName = toDisplayName(name);
    const existing = this.graph.people.get(normalizedName);
    const snippet = context.slice(0, 120).trim();
    const snippetFingerprint = normalizeText(snippet).slice(0, 80);

    if (existing) {
      existing.lastMentioned = timestamp;
      existing.mentionCount++;
      if (relationship !== "known_person" && !existing.relationships.includes(relationship)) {
        existing.relationships.push(relationship);
      }
      // Add unique context snippets with normalized dedupe so punctuation changes
      // do not create duplicate evidence for the same mention.
      if (!existing.context.some(c => normalizeText(c).slice(0, 80) === snippetFingerprint)) {
        existing.context.push(snippet);
      }
      if (existing.context.length > 15) existing.context = existing.context.slice(-15);
    } else {
      this.graph.people.set(normalizedName, {
        name: displayName,
        context: [snippet],
        relationships: [relationship],
        firstMentioned: timestamp,
        lastMentioned: timestamp,
        mentionCount: 1,
      });
    }
  }

  /**
   * Builds relational edges between facts and entities
   */
  private updateGraphEdges(newFacts: ExtractedFact[]): void {
    const now = Date.now();
    for (const fact of newFacts) {
      // Link fact to subject person if exists
      const subjectName = fact.subject.toLowerCase();
      if (this.graph.people.has(subjectName)) {
        this.edges.push({
          id: `edge-${now}-${Math.random().toString(36).slice(2, 7)}`,
          source: subjectName,
          target: fact.id,
          relation: "has_fact",
          weight: 1.0
        });
      }

      // Link facts together by shared entities
      const entities = extractEntities(`${fact.subject} ${fact.predicate} ${fact.object}`);
      for (const entity of entities) {
        if (this.graph.people.has(entity)) {
          this.edges.push({
            id: `edge-${now}-${Math.random().toString(36).slice(2, 7)}`,
            source: fact.id,
            target: entity,
            relation: "mentions",
            weight: 0.8
          });
        }
      }
    }

    // Keep edges capped
    if (this.edges.length > 2000) {
      this.edges = this.edges.slice(-2000);
    }
  }

  /**
   * Extract knowledge from a user message and persist it
   */
  async extract(message: string, conversationId: string): Promise<ExtractedFact[]> {
    if (!message.trim() || message.length < 4) return [];

    const facts: ExtractedFact[] = [];
    const now = Date.now();
    const seenPeople = new Set<string>();
    const seenFacts = new Set<string>();
    let lastSubject = "user";

    // Helper to resolve pronouns
    const resolveSubject = (raw: string | undefined): string => {
      if (!raw) return lastSubject;
      const lower = raw.toLowerCase();
      if (lower === "i") return "user";
      if (["he", "she", "they"].includes(lower)) return lastSubject;
      if (INVALID_NAME_WORDS.has(lower)) return "user";
      lastSubject = raw; // Update last subject if it's a new name
      return raw;
    };
    for (const entry of NAME_PATTERNS) {
      const { pattern, isSelf } = entry;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const fullMatch = match[0];
        const contextLower = fullMatch.toLowerCase();
        let relationship = isSelf ? "self" : "known_person";

        const relationshipGroup = match[1]?.toLowerCase();
        const inverseRelationshipGroup = match[2]?.toLowerCase();
        
        if (relationshipGroup && RELATIONSHIP_MAP[relationshipGroup]) {
          relationship = normalizeRelationship(relationshipGroup);
        } else if (inverseRelationshipGroup && RELATIONSHIP_MAP[inverseRelationshipGroup]) {
          relationship = normalizeRelationship(inverseRelationshipGroup);
        } else {
          // Fallback scan for relationship terms in the whole match
          for (const [key, value] of Object.entries(RELATIONSHIP_MAP)) {
            if (contextLower.includes(key)) {
              relationship = value;
              break;
            }
          }
        }

        let rawNames = match[1] && match[2] 
          ? (RELATIONSHIP_MAP[match[1].toLowerCase()] ? match[2] : match[1])
          : (match[1] || match[2] || "");

        // Strip trailing conjunctions/pronouns that may have been caught by the regex
        rawNames = rawNames.replace(/\s+(?:and|who|that|which|where|when|i|he|she|it|they|we|is|am|are|was|were|has|have|had).*/i, "").trim();

        const candidates = splitNameCandidates(rawNames)
          .filter((name, index, arr) => arr.indexOf(name) === index);

        for (const name of candidates) {
          const normalizedName = name.toLowerCase();
          if (seenPeople.has(normalizedName)) continue;
          seenPeople.add(normalizedName);
          lastSubject = name; // Track the most recently named person

          const confidence = relationship !== "known_person" ? 0.95 : 0.85;
          this.registerPerson(name, relationship, fullMatch, now);

          const fact: ExtractedFact = {
            id: `fact-${now}-${Math.random().toString(36).slice(2, 8)}`,
            type: "person",
            subject: "user",
            predicate: relationship === "self" ? "is_named" : `knows_${relationship}`,
            object: name,
            confidence,
            source: conversationId,
            timestamp: now,
            importance: 0.9, // People are important
          };
          const fingerprint = factFingerprint(fact);
          if (!seenFacts.has(fingerprint)) {
            seenFacts.add(fingerprint);
            facts.push(fact);
          }
        }
      }
    }

    // 2. Extract preferences (likes, dislikes, habits)
    for (const { pattern, type } of PREFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const isFavoriteType = type === "favorite";
        const subject = resolveSubject((match as any)[1]);
        
        let item: string | undefined;
        let value: string | undefined;

        if (isFavoriteType) {
          // Favorite patterns usually have 3 groups if named: [name][category][value]
          // or 2 groups if possessive: [none][category][value]
          // Based on line 67: [name's][category][value]
          if (match[3]) {
            item = match[2]?.trim();
            value = match[3]?.trim();
          } else {
            item = match[1]?.trim();
            value = match[2]?.trim();
          }
        } else {
          item = match[2]?.trim();
          value = item;
        }

        if (!value || value.length < 2) continue;

        const category = isFavoriteType && item ? item.toLowerCase() : type;
        const finalPreference = value;

        const key = `${subject}:${category}:${finalPreference.toLowerCase().slice(0, 40)}`;
        this.graph.preferences.set(key, finalPreference);

        const fact: ExtractedFact = {
          id: `pref-${now}-${Math.random().toString(36).slice(2, 8)}`,
          type: "preference",
          subject: subject,
          predicate: category,
          object: finalPreference,
          confidence: 0.9,
          source: conversationId,
          timestamp: now,
          importance: 0.95, // Preferences are critical for "Better Chatting"
        };
        const fingerprint = factFingerprint(fact);
        if (!seenFacts.has(fingerprint)) {
          seenFacts.add(fingerprint);
          facts.push(fact);
        }
      }
    }

    // 3. Extract broader personal facts (job, location, skills)
    for (const record of FACT_PATTERNS) {
      const pattern = record.pattern;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const rawSubject = (match as any)[1];
        const subject = resolveSubject(rawSubject);
        const statement = match[2]?.trim();
        if (!statement || statement.length < 4) continue;

        // --- Implicit Entity Discovery ---
        // If the subject is a third party (not 'user' or pronouns) and not known, add them!
        if (subject !== "user" && !["he", "she", "they"].includes(subject.toLowerCase())) {
          const normalizedSub = subject.toLowerCase();
          if (isLikelyName(subject) && !this.graph.people.has(normalizedSub)) {
            this.registerPerson(subject, "known_person", message, now);
            seenPeople.add(normalizedSub);

            // Add an implicit "knows" fact too
            facts.push({
              id: `fact-implicit-${now}-${Math.random().toString(36).slice(2, 8)}`,
              type: "person",
              subject: "user",
              predicate: "knows_person",
              object: toDisplayName(subject),
              confidence: 0.7,
              source: conversationId,
              timestamp: now,
              importance: 0.6,
            });
          }
        }

        // Detect sub-type via keywords
        let subType: ExtractedFact["type"] = "fact";
        const lowerVal = statement.toLowerCase();
        if (/\b(work|job|role|position|engineer|developer|manager|lead)\b/.test(lowerVal)) subType = "skill";
        else if (/\b(using|know|skilled|expert|proficient)\b/.test(lowerVal)) subType = "skill";
        else if (/\b(live|stay|located|at|in|near|city)\b/.test(lowerVal)) subType = "location";

        const fact: ExtractedFact = {
          id: `fact-${now}-${Math.random().toString(36).slice(2, 8)}`,
          type: subType,
          subject: subject,
          predicate: "stated",
          object: statement,
          confidence: 0.85,
          source: conversationId,
          timestamp: now,
          importance: 0.7,
        };
        const fingerprint = factFingerprint(fact);
        if (!seenFacts.has(fingerprint)) {
          seenFacts.add(fingerprint);
          facts.push(fact);
        }
      }
    }

    // 3b. Extract Style & Sentiment
    for (const { pattern, style, confidence } of STYLE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(message)) {
        const fact: ExtractedFact = {
          id: `style-${now}-${Math.random().toString(36).slice(2, 8)}`,
          type: "style",
          subject: "user",
          predicate: "prefers_style",
          object: style,
          confidence,
          source: conversationId,
          timestamp: now,
          importance: 1.0, // Top importance for style
        };
        const fingerprint = factFingerprint(fact);
        if (!seenFacts.has(fingerprint)) {
          seenFacts.add(fingerprint);
          facts.push(fact);
        }
      }
    }
    for (const { pattern, sentiment, confidence } of SENTIMENT_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(message)) {
        const fact: ExtractedFact = {
          id: `sent-${now}-${Math.random().toString(36).slice(2, 8)}`,
          type: "sentiment",
          subject: "user",
          predicate: "is_feeling",
          object: sentiment,
          confidence,
          source: conversationId,
          timestamp: now,
          importance: 0.5, // Sentiment is transient
        };
        const fingerprint = factFingerprint(fact);
        if (!seenFacts.has(fingerprint)) {
          seenFacts.add(fingerprint);
          facts.push(fact);
        }
      }
    }

    // 4. Re-mention detection: update known people mentioned without relationship context
    // This handles "Adam moved to Austin" where Adam is already known but not re-detected by NAME_PATTERNS
    for (const [key, person] of this.graph.people) {
      if (seenPeople.has(key)) continue; // Already processed
      const nameTokens = key.split(/\s+/);
      // Check if any name token appears as a standalone word in the message
      const msgLower = message.toLowerCase();
      const mentioned = nameTokens.some(token => {
        if (token.length < 3) return false;
        const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(msgLower);
      });
      if (mentioned) {
        person.lastMentioned = now;
        person.mentionCount++;
        const snippet = message.slice(0, 120);
        if (!person.context.some(c => c.includes(snippet.slice(0, 20)))) {
          person.context.push(snippet);
        }
        if (person.context.length > 15) person.context = person.context.slice(-15);
        seenPeople.add(key);
      }
    }

    // Persist extracted facts if meaning was found
    if (facts.length > 0) {
      // Deduplicate facts before adding
      const newFacts = facts.filter(fact => {
        const fingerprint = factFingerprint(fact);
        return !this.graph.facts.some((existing) => {
          const existingFingerprint = factFingerprint(existing);
          if (existingFingerprint !== fingerprint) return false;
          return now - existing.timestamp < 1000 * 60 * 60 * 6; // Avoid noisy repeats for 6 hours
        });
      });

      if (newFacts.length > 0) {
        this.graph.facts.push(...newFacts);
        this.updateGraphEdges(newFacts);

        // Consolidate facts immediately if new ones were added to handle conflicts
        this.consolidateFacts();

        // Cap at 1000 facts (increased from 500), keep most relevant/recent
        if (this.graph.facts.length > 1000) {
          // Sort briefly by confidence and recency if over limit
          this.graph.facts = this.graph.facts
            .sort((a, b) => (b.timestamp + b.confidence * 100000) - (a.timestamp + a.confidence * 100000))
            .slice(0, 1000);
        }
        this.graph.lastUpdated = now;
        this.saveGraph();

        // Also persist to IndexedDB via agent memory
        const memory = getAgentMemoryManager();
        for (const fact of newFacts) {
          try {
            await memory.addKnowledge(
              "nila" as AgentId,
              `${fact.type}:${fact.predicate}`,
              fact.object,
              conversationId
            );
          } catch (e) {
            console.warn("Failed to persist fact to agent memory:", e);
          }
        }
      }
    }

    return facts;
  }

  /**
   * Performs graph traversal to find connected knowledge
   */
  private getConnectedKnowledge(factIds: string[], depth: number = 1): ExtractedFact[] {
    const connectedFactIds = new Set<string>(factIds);
    let currentLevel = [...factIds];

    for (let d = 0; d < depth; d++) {
      const nextLevel: string[] = [];
      for (const id of currentLevel) {
        // Find edges where this fact is source or target
        const neighbors = this.edges
          .filter(e => e.source === id || e.target === id)
          .map(e => e.source === id ? e.target : e.source);
        
        for (const neighbor of neighbors) {
          // If neighbor is a fact ID, add it
          if (neighbor.startsWith("fact-") || neighbor.startsWith("pref-")) {
            if (!connectedFactIds.has(neighbor)) {
              connectedFactIds.add(neighbor);
              nextLevel.push(neighbor);
            }
          } else {
            // Neighbor is an entity (person name), find all facts linked to this person
            const entityFacts = this.edges
              .filter(e => (e.source === neighbor || e.target === neighbor) && e.relation === "has_fact")
              .map(e => e.source === neighbor ? e.target : e.source);
            
            for (const ef of entityFacts) {
              if (!connectedFactIds.has(ef)) {
                connectedFactIds.add(ef);
                nextLevel.push(ef);
              }
            }
          }
        }
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    return this.graph.facts.filter(f => connectedFactIds.has(f.id));
  }
  /**
   * Consolidate similar facts to reduce noise and strengthen common patterns
   */
  private consolidateFacts(): void {
    const consolidated: ExtractedFact[] = [];
    const processed = new Set<string>();

    // Sort by timestamp descending to keep newer objects but older identities
    const sortedFacts = [...this.graph.facts].sort((a, b) => b.timestamp - a.timestamp);

    for (let i = 0; i < sortedFacts.length; i++) {
      const f1 = sortedFacts[i];
      if (processed.has(f1.id)) continue;

      const mergedFact = { ...f1 };
      processed.add(f1.id);

      for (let j = i + 1; j < sortedFacts.length; j++) {
        const f2 = sortedFacts[j];
        if (processed.has(f2.id)) continue;

        // Check for high similarity
        const sameSubject = f1.subject.toLowerCase() === f2.subject.toLowerCase();
        const sameType = f1.type === f2.type;
        const samePredicate = f1.predicate === f2.predicate;

        // Semantic similarity check for object
        const o1 = f1.object.toLowerCase();
        const o2 = f2.object.toLowerCase();
        const dist = this.getLevenshteinDistance(o1, o2);
        const isSimilar = o1.includes(o2) || o2.includes(o1) || (o1.length > 5 && o2.length > 5 && dist < 3);

        if (sameSubject && sameType && samePredicate) {
          if (isSimilar) {
            // Merge: use more specific (longer) object, average confidence, update timestamp
            if (o2.length > mergedFact.object.length) mergedFact.object = f2.object;
            mergedFact.confidence = Math.min(1, (mergedFact.confidence + f2.confidence) / 1.5);
            mergedFact.timestamp = Math.max(mergedFact.timestamp, f2.timestamp);
            processed.add(f2.id);
          } else {
            // Conflict detection: same subject/predicate but different object (and not similar)
            // e.g. "Lives in NYC" vs "Lives in Paris"
            // We keep the newer one (mergedFact is newer because we sorted descending)
            // but we significantly lower the confidence of the OLDER one so it decays faster
            // and we also mark it as processed so it doesn't clutter the top results
            f2.confidence *= 0.3;
            f2.importance *= 0.3;
            // Don't mark as processed yet, let it exist but weak
          }
        } else if (sameSubject && sameType && isSimilar) {
           // Case where predicates differ slightly but objects are similar
           mergedFact.confidence = Math.min(1, (mergedFact.confidence + f2.confidence) / 1.8);
           processed.add(f2.id);
        }
      }
      consolidated.push(mergedFact);
    }

    // Filter out very low confidence facts that were superseded
    this.graph.facts = consolidated.filter(f => f.confidence > 0.2);
  }

  private getLevenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[len1][len2];
  }

  /**
   * Query the knowledge graph for relevant facts about a topic
   */
  query(queryText: string, limit: number = 12): ExtractedFact[] {
    const queryLower = queryText.toLowerCase();
    const queryWords = tokenizeQuery(queryText);
    const querySet = new Set(queryWords);
    const queryEntities = extractEntities(queryText);
    const queryFingerprint = normalizeText(queryText);

    // ── Entity-Aware Boost: detect known people names in the query ──
    // This fixes the bug where "what does Adam do?" fails because "adam"
    // gets filtered out by the generic tokenizer above.
    const knownPeopleInQuery = new Set<string>();
    for (const [key] of this.graph.people) {
      // Check if the query contains this person's name (case-insensitive)
      if (queryLower.includes(key)) {
        knownPeopleInQuery.add(key);
      }
      // Also check individual name tokens (e.g., "Adam" from "Adam Smith")
      for (const token of key.split(/\s+/)) {
        if (token.length >= 2 && queryLower.includes(token)) {
          knownPeopleInQuery.add(key);
        }
      }
    }
    for (const entity of queryEntities) {
      const normalizedEntity = entity.toLowerCase();
      for (const [key] of this.graph.people) {
        if (key.includes(normalizedEntity) || normalizedEntity.includes(key)) {
          knownPeopleInQuery.add(key);
        }
      }
    }

    const semanticClusters: Record<string, string[]> = {
      tech: ["code", "programming", "software", "developer", "engineer", "javascript", "python", "react", "api", "database", "server", "frontend", "backend", "algorithm", "debug", "function", "class", "variable", "framework"],
      work: ["job", "career", "company", "startup", "boss", "manager", "office", "meeting", "deadline", "project", "client", "salary", "promotion"],
      learning: ["study", "learn", "course", "tutorial", "practice", "skill", "knowledge", "education", "university", "college", "school", "exam", "test"],
      personal: ["family", "friend", "relationship", "love", "date", "marriage", "birthday", "party", "vacation", "travel"],
      health: ["exercise", "gym", "workout", "health", "diet", "sleep", "doctor", "medicine", "symptom", "treatment"],
      finance: ["money", "investment", "stock", "crypto", "bank", "savings", "budget", "expense", "income", "tax"],
    };

    const initialMatches: ExtractedFact[] = this.graph.facts
      .map(fact => {
        let score = 0;
        const subject = fact.subject.toLowerCase();
        const predicate = fact.predicate.toLowerCase();
        const object = fact.object.toLowerCase();
        const factText = `${subject} ${predicate} ${object}`;
        const normalizedFactText = normalizeText(factText);
        const queryOverlap = sentenceHasQueryOverlap(querySet, factText);
        
        // 1. Direct object/subject mention (High weight)
        if (normalizedFactText.includes(queryFingerprint) || queryFingerprint.includes(normalizedFactText)) {
          score += 20;
        }
        if (subject !== "user" && (subject.includes(queryLower) || queryLower.includes(subject))) {
          score += 10;
        }
        if (queryEntities.some((entity) => normalizedFactText.includes(entity.toLowerCase()))) {
          score += 8;
        }

        // 1b. Entity-aware boost: if the fact mentions a known person from the query
        for (const personKey of knownPeopleInQuery) {
          if (object.includes(personKey) || subject.includes(personKey) ||
              factText.includes(personKey)) {
            score += 15;
            break; // One boost per fact is enough
          }
        }

        // 2. Word overlap (Medium weight)
        let overlap = queryOverlap;
        const factWords = factText.split(/\s+/).filter(w => w.length > 2);
        for (const word of factWords) {
          const normalizedWord = word.replace(/'s$/, "").toLowerCase();
          if (querySet.has(normalizedWord)) overlap += 1;
        }
        
        // Semantic expansion (Lightweight) - Domain clustering
        for (const [, keywords] of Object.entries(semanticClusters)) {
          const domainHits = keywords.filter(kw => queryLower.includes(kw) || querySet.has(kw));
          const factHits = keywords.filter(kw => normalizedFactText.includes(kw));
          if (domainHits.length > 0 && factHits.length > 0) {
            overlap += (domainHits.length * factHits.length) * 0.5;
          }
        }

        // Legacy semantic checks for backward compatibility
        if (queryLower.includes("sport") && /\b(tennis|swim|football|basketball|run|gym|bike)\b/i.test(factText)) overlap += 1.0;
        if (queryLower.includes("work") && /\b(job|startup|engineer|company|office|boss|manager|lead)\b/i.test(factText)) overlap += 1.0;
        if (queryLower.includes("food") && /\b(eat|coffee|drink|breakfast|lunch|dinner|restaurant|pizza|bitter)\b/i.test(factText)) overlap += 1.0;

        score += (overlap / Math.max(querySet.size, 1)) * 10;

        // 3. Type-based relevance
        if (fact.type === "person" && (queryLower.includes("who") || queryLower.includes("friend") || queryLower.includes("know") || queryLower.includes("people") || queryLower.includes("person"))) {
          score += 3;
        }
        if (fact.type === "preference" && (queryLower.includes("like") || queryLower.includes("prefer") || queryLower.includes("habit") || queryLower.includes("love") || queryLower.includes("hate") || queryLower.includes("dislike"))) {
          score += 3;
        }
        if (fact.type === "location" && (queryLower.includes("where") || queryLower.includes("live") || queryLower.includes("at") || queryLower.includes("location") || queryLower.includes("place"))) {
          score += 3;
        }
        // FIX: "what does X do?" should match skill/work facts — "do" was in stop words
        if (fact.type === "skill" && (queryLower.includes("what") || /\bdo(es)?\b/.test(queryLower) || queryLower.includes("skill") || queryLower.includes("work") || queryLower.includes("know") || queryLower.includes("can") || queryLower.includes("job") || queryLower.includes("role"))) {
          score += 3;
        }
        // Boost person facts when asking "what does [name] do?"
        if (fact.type === "person" && /\bdo(es)?\b/.test(queryLower) && knownPeopleInQuery.size > 0) {
          score += 2;
        }
        if (fact.type === "style" && /style|tone|voice|verbosity|concise|detailed/i.test(queryLower)) {
          score += 2.5;
        }
        if (fact.type === "sentiment" && /feel|emotion|mood|frustrat|happy|sad|stressed|excited/i.test(queryLower)) {
          score += 2;
        }

        // 4. Recency decay (Gentle)
        const ageDays = (Date.now() - fact.timestamp) / (1000 * 60 * 60 * 24);
        const recencyFactor = Math.pow(0.99, ageDays); // Very slow decay
        score *= (0.5 + 0.5 * recencyFactor);

        // 5. Confidence & Importance multiplier
        score *= fact.confidence;
        score *= (0.7 + 0.3 * (fact.importance || 0.5));

        const importanceBonus = 0.65 + 0.35 * (fact.importance || 0.5);
        return { ...fact, _score: score * importanceBonus };
      })
      .filter(f => (f._score || 0) > 0.5) // Lowered threshold significantly for verification tests and better recall
      .sort((a, b) => (b._score || 0) - (a._score || 0))
      .slice(0, Math.max(6, Math.ceil(limit * 0.75)));

    // Graph expansion: find connected knowledge for initial matches
    const initialIds = initialMatches.map(f => f.id);
    const expansionDepth = /\b(who|what|where|how|why|tell me about|related|connected|relationship)\b/i.test(queryLower) ? 2 : 1;
    const expandedFacts = this.getConnectedKnowledge(initialIds, expansionDepth);
    
    // Merge and deduplicate
    const finalFacts = [...initialMatches];
    for (const ef of expandedFacts) {
      if (!finalFacts.some(f => f.id === ef.id)) {
        // Connected facts get a slightly lower score than direct matches
        (ef as any)._score = Math.max((ef as any)._score || 0, 1.5);
        finalFacts.push(ef);
      }
    }

    return finalFacts
      .sort((a, b) => ((b as any)._score || 0) - ((a as any)._score || 0))
      .slice(0, limit);
  }

  /**
   * Helper to extract knowledge from a full interaction (query + answer)
   */
  async extractFromInteraction(message: string, answer: string, conversationId: string): Promise<ExtractedFact[]> {
    const combinedContent = `User: ${message}\nAssistant: ${answer}`;
    return this.extract(combinedContent, conversationId);
  }

  /**
   * Alias for buildContextSummary to match interface expected by hooks
   */
  getRelevantKnowledge(query: string): string {
    return this.buildContextSummary(query);
  }

  /**
   * Get topical context for a specific concept
   */
  getTopicalContext(topic: string): string {
    const facts = this.query(topic, 5);
    if (facts.length === 0) return "";

    return facts.map(f => `• ${f.subject} ${f.predicate} ${f.object}`).join("\n");
  }

  /**
   * Look up a person by name
   */
  findPerson(name: string): PersonEntity | null {
    const normalized = name.toLowerCase().trim();
    // Try exact match
    const person = this.graph.people.get(normalized);
    if (person) return person;

    // Try partial match (e.g., "Adam" matches "Adam Smith")
    for (const [key, p] of this.graph.people) {
      if (key.includes(normalized) || normalized.includes(key)) return p;
    }
    return null;
  }

  /**
   * Get all known people
   */
  getAllPeople(): PersonEntity[] {
    return Array.from(this.graph.people.values());
  }

  /**
   * Get all preferences
   */
  getPreferences(): Map<string, string> {
    return new Map(this.graph.preferences);
  }

  /**
   * Build a context summary for the AI system prompt
   */
  buildContextSummary(query: string): string {
    const parts: string[] = [];
    const queryLower = query.toLowerCase();

    // 1. People context (NER integration)
    const mentionedPeople: PersonEntity[] = [];
    for (const [key, person] of this.graph.people) {
      if (queryLower.includes(key) || queryLower.includes(person.name.toLowerCase())) {
        mentionedPeople.push(person);
      }
    }

    if (mentionedPeople.length > 0) {
      const personLines = mentionedPeople.map(p => {
        const rels = p.relationships.filter(r => r !== "known_person");
        const relStr = rels.length > 0 ? ` (${rels.join(", ")})` : "";
        const context = p.context.length > 0 ? ` | Last context: "${p.context[p.context.length-1]}"` : "";
        return `• ${p.name}${relStr}: Mentioned ${p.mentionCount}x${context}`;
      });
      parts.push(`[Known People & Relationships]\n${personLines.join("\n")}`);
    }

    // 2. Extracted Facts & Knowledge
    const relevantFacts = this.query(query, 8);
    if (relevantFacts.length > 0) {
      const factLines = relevantFacts.map(f => {
        let prefix = "•";
        if (f.type === "location") prefix = "📍";
        if (f.type === "skill") prefix = "🛠️";
        if (f.type === "preference") prefix = f.predicate === "dislike" ? "⚠️" : "✨";
        if (f.type === "event") prefix = "📅";
        
        return `${prefix} ${f.subject} ${f.predicate} ${f.object} (${f.type})`;
      });
      parts.push(`[Personal Context]\n${factLines.join("\n")}`);
    }

    // 3. User Preferences (General)
    const relevantPrefs = Array.from(this.graph.preferences.entries())
      .filter(([k]) => {
        const words = k.split(/[:\s_]/);
        return words.some(w => w.length > 3 && queryLower.includes(w));
      })
      .slice(0, 4);

    if (relevantPrefs.length > 0) {
      const prefLines = relevantPrefs.map(([k, v]) => `• ${k.split(":")[0]}: ${v}`);
      parts.push(`[Preferences]\n${prefLines.join("\n")}`);
    }

    // 4. Interaction Summary (if asking about user)
    const isWhoAmI = /\b(who am i|tell me about me|what do you know about me|my profile|about me|my name|describe me|personality)\b/i.test(queryLower);
    if (isWhoAmI) {
      const allPeople = this.getAllPeople();
      const stats = this.getStats();
      
      // Find user's own name
      const userNameFact = this.graph.facts.find(f => f.subject === "user" && f.predicate === "is_named");
      const userIdentity = userNameFact ? `Your name is ${userNameFact.object}.` : "The user's name is not yet explicitly stored.";

      // Get ALL user facts for a deep "tell me about me"
      const userFacts = this.graph.facts
        .filter(f => f.subject === "user")
        .sort((a, b) => b.timestamp - a.timestamp);

      if (allPeople.length > 0 || stats.totalFacts > 0) {
        const summary = [
          userIdentity,
          `Memory Stats: ${stats.totalFacts} facts, ${stats.totalPeople} people, ${stats.totalPreferences} preferences`,
          `Recent User Facts:`,
          ...userFacts.slice(0, 15).map(f => `• ${f.predicate}: ${f.object}`),
          `People known: ${allPeople.slice(0, 5).map(p => p.name).join(", ")}${allPeople.length > 5 ? ` and ${allPeople.length - 5} more` : ''}`,
        ];
        // Preserve legacy section label for existing prompts/tests while keeping richer content.
        parts.push(`[Identity & Memory Summary]\n${summary.join("\n")}`);
      }
    }

    if (parts.length === 0) return "";

    return [
      "CROSS-CHAT MEMORY (Use these facts to personalize your response):",
      ...parts
    ].join("\n\n");
  }

  /**
   * Clear all knowledge (for testing)
   */
  clear(): void {
    this.graph = { facts: [], people: new Map(), preferences: new Map(), lastUpdated: Date.now() };
    try {
      localStorage.removeItem(KnowledgeExtractor.STORAGE_KEY);
    } catch { /* ignore */ }
  }

  /**
   * Get stats about the knowledge graph
   */
  getStats() {
    return {
      totalFacts: this.graph.facts.length,
      totalPeople: this.graph.people.size,
      totalPreferences: this.graph.preferences.size,
      factsByType: this.graph.facts.reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      lastUpdated: this.graph.lastUpdated,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let _instance: KnowledgeExtractor | null = null;

export function getKnowledgeExtractor(): KnowledgeExtractor {
  if (!_instance) {
    _instance = new KnowledgeExtractor();
    if (typeof window !== "undefined") {
      (window as any)._KNOWLEDGE_EXTRACTOR = _instance;
    }
  }
  return _instance;
}

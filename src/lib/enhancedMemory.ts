/**
 * Enhanced Memory System — Tracks user topics, interests, and communication
 * preferences across all conversations for deep personalization.
 * 
 * Features:
 * - Topic extraction with recency weighting
 * - Emotional pattern tracking over time
 * - Communication style detection
 * - Learning rate for adaptive memory
 * - Conversation flow analysis
 */
import type { Conversation } from "./chat";

interface UserTopic {
  topic: string;
  count: number;
  lastMentioned: number;
  sentiment: "positive" | "neutral" | "negative";
  recencyWeightedCount: number;
}

interface EmotionalPattern {
  emotion: string;
  count: number;
  lastSeen: number;
  averageIntensity: number;
}

interface CommunicationPreference {
  preferredLength: "concise" | "balanced" | "detailed";
  technicalLevel: "beginner" | "intermediate" | "advanced";
  detectedLanguages: string[];
  questionFrequency: number;
  codeShareFrequency: number;
  emojiUsage: number;
}

interface ConversationFlow {
  avgMessagesPerConversation: number;
  avgMessageLength: number;
  sessionDuration: number;
  returnRate: number;
}

interface UserProfile {
  name?: string;
  role?: string;
  primaryGoal?: string;
  location?: string;
}

interface EnhancedMemoryState {
  topics: UserTopic[];
  interests: string[];
  emotionalPatterns: EmotionalPattern[];
  communicationPrefs: CommunicationPreference;
  conversationFlow: ConversationFlow;
  userProfile: UserProfile;
  lastUpdated: number;
  totalMessages: number;
  totalConversations: number;
  processedMessageKeys: string[];
  currentSessionId?: string;
  sessionStartTime?: number;
}

const STORAGE_KEY = "dalam-enhanced-memory";
const RECENCY_DECAY = 0.95;
const MAX_PROCESSED_MESSAGE_KEYS = 5000;

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "it", "its", "i", "me", "my", "you", "your", "he", "she", "they",
  "them", "this", "that", "what", "which", "who", "whom"
]);

const EMOTION_PATTERNS: Record<string, RegExp[]> = {
  frustrated: [/\bfrustrat|annoying|stuck|not working|broken|issue|problem\b/i],
  excited: [/\bexcited|thrilled|pumped|enthusiastic|amazing|love it\b/i],
  confused: [/\bconfused|don't understand|unclear|what|why|how do\b/i],
  stressed: [/\bstressed|overwhelmed|too much|pressure|deadline\b/i],
  happy: [/\bhappy|great|excellent|wonderful|perfect|love\b/i],
};

function loadState(): EnhancedMemoryState {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Prune processedMessageKeys that are too old to keep the set bounded
        try {
          if (Array.isArray(parsed.processedMessageKeys)) {
            const retentionMs = 1000 * 60 * 60 * 24 * 90; // 90 days
            const now = Date.now();
            parsed.processedMessageKeys = parsed.processedMessageKeys.filter((k: string) => {
              const parts = String(k).split(":");
              const ts = Number(parts[0]) || 0;
              return now - ts <= retentionMs;
            });
          }
        } catch {
          // If anything goes wrong, just ignore pruning and continue
        }
        return {
          ...parsed,
          emotionalPatterns: parsed.emotionalPatterns || [],
          conversationFlow: parsed.conversationFlow || {
            avgMessagesPerConversation: 0,
            avgMessageLength: 0,
            sessionDuration: 0,
            returnRate: 0,
          },
          userProfile: parsed.userProfile || {},
          totalMessages: parsed.totalMessages || 0,
          totalConversations: parsed.totalConversations || 0,
          processedMessageKeys: Array.isArray(parsed.processedMessageKeys) ? parsed.processedMessageKeys.slice(-MAX_PROCESSED_MESSAGE_KEYS) : [],
        };
      }
    }
  } catch (err) {
    console.error("Failed to load enhanced memory state:", err);
  }
    return {
      topics: [],
      interests: [],
      emotionalPatterns: [],
      communicationPrefs: {
        preferredLength: "balanced",
        technicalLevel: "intermediate",
        detectedLanguages: ["en"],
        questionFrequency: 0,
        codeShareFrequency: 0,
        emojiUsage: 0,
      },
      conversationFlow: {
        avgMessagesPerConversation: 0,
        avgMessageLength: 0,
        sessionDuration: 0,
        returnRate: 0,
      },
      userProfile: {},
      lastUpdated: 0,
      totalMessages: 0,
      totalConversations: 0,
      processedMessageKeys: [],
      currentSessionId: Math.random().toString(36).substring(7),
      sessionStartTime: Date.now(),
    };
}

function pruneProcessedKeysList(keys: string[], retentionDays: number = 90): string[] {
  const retentionMs = 1000 * 60 * 60 * 24 * retentionDays;
  const now = Date.now();
  return keys.filter(k => {
    const parts = String(k).split(":");
    const ts = Number(parts[0]) || 0;
    return now - ts <= retentionMs;
  }).slice(-MAX_PROCESSED_MESSAGE_KEYS);
}

function saveState(state: EnhancedMemoryState) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (err) {
    console.error("Failed to save enhanced memory state:", err);
  }
}

function extractTopics(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const meaningful = words.filter(w => w.length > 3 && !STOP_WORDS.has(w));
  const bigrams: string[] = [];
  for (let i = 0; i < meaningful.length - 1; i++) {
    bigrams.push(`${meaningful[i]} ${meaningful[i + 1]}`);
  }
  return [...new Set([...meaningful.slice(0, 6), ...bigrams.slice(0, 3)])];
}

function detectTechnicalLevel(text: string): "beginner" | "intermediate" | "advanced" {
  const advancedPatterns = /\b(algorithm|architecture|kubernetes|docker|microservices|neural network|gradient|regression|polymorphism|abstraction|concurrency|mutex|semaphore|eigenvalue|refactor|microservice|distributed|monolith)\b/i;
  const beginnerPatterns = /\b(what is|how to|explain|simple|basic|beginner|easy|help me understand|first time|new to)\b/i;
  if (advancedPatterns.test(text)) return "advanced";
  if (beginnerPatterns.test(text)) return "beginner";
  return "intermediate";
}

function detectEmotion(text: string): { emotion: string; intensity: number } | null {
  const lower = text.toLowerCase();
  for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        const intensity = Math.min(1, (lower.match(/!/g) || []).length * 0.2 + 0.5);
        return { emotion, intensity };
      }
    }
  }
  return null;
}

function calculateRecencyWeight(lastMentioned: number): number {
  const daysSince = (Date.now() - lastMentioned) / (1000 * 60 * 60 * 24);
  return Math.pow(RECENCY_DECAY, daysSince);
}

function buildMessageKey(content: string, timestamp: Date): string {
  // Use timestamp + hash of content to avoid collisions and redundant ingestion.
  const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();
  const hash = normalized.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `${timestamp.getTime()}:${hash}`;
}

export class EnhancedMemory {
  private state: EnhancedMemoryState;

  constructor() {
    this.state = loadState();
  }

  /**
   * Ingests conversations into the memory system.
   * @param conversations List of conversations to process
   * @param options Ingestion options including privacy controls
   */
  ingestConversations(
    conversations: Conversation[], 
    options: { isGuest?: boolean; forceRefresh?: boolean } = {}
  ) {
    // PRIVACY: Skip ingestion for guests to prevent building persistent profiles
    if (options.isGuest) {
      return;
    }

    if (options.forceRefresh) {
      this.state.processedMessageKeys = [];
      this.state.topics = [];
      this.state.emotionalPatterns = [];
    }

    const userMessages = conversations.flatMap(c =>
      c.messages
        .filter(m => m.role === "user")
        .map(m => ({ content: m.content, timestamp: new Date(m.timestamp) }))
    );
    userMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const processed = new Set(this.state.processedMessageKeys || []);
    const newMessages = userMessages.filter((m) => {
      const key = buildMessageKey(m.content, m.timestamp);
      if (processed.has(key)) return false;
      processed.add(key);
      return true;
    });

    if (newMessages.length === 0 && !options.forceRefresh) {
      return; // Nothing new to process
    }

    // Update conversation flow metrics
    this.state.totalConversations = conversations.length;
    this.state.totalMessages = userMessages.length;
    
    const totalLength = userMessages.reduce((sum, m) => sum + m.content.length, 0);
    this.state.conversationFlow.avgMessageLength = 
      userMessages.length > 0 ? totalLength / userMessages.length : 0;
    this.state.conversationFlow.avgMessagesPerConversation =
      conversations.length > 0 ? userMessages.length / conversations.length : 0;

    // Process NEW messages
    for (const msg of newMessages) {
      const messageTs = msg.timestamp.getTime();
      const topics = extractTopics(msg.content);
      
      for (const topic of topics) {
        const existing = this.state.topics.find(t => t.topic === topic);
        if (existing) {
          existing.count++;
          existing.lastMentioned = Math.max(existing.lastMentioned, messageTs);
        } else {
          this.state.topics.push({ 
            topic, 
            count: 1, 
            lastMentioned: messageTs, 
            sentiment: "neutral",
            recencyWeightedCount: calculateRecencyWeight(messageTs),
          });
        }
      }

      // Detect emotional patterns
      const emotion = detectEmotion(msg.content);
      if (emotion) {
        const existingEmotion = this.state.emotionalPatterns.find(e => e.emotion === emotion.emotion);
        if (existingEmotion) {
          existingEmotion.count++;
          existingEmotion.lastSeen = Math.max(existingEmotion.lastSeen, messageTs);
          existingEmotion.averageIntensity = 
            (existingEmotion.averageIntensity + emotion.intensity) / 2;
        } else {
          this.state.emotionalPatterns.push({
            emotion: emotion.emotion,
            count: 1,
            lastSeen: messageTs,
            averageIntensity: emotion.intensity,
          });
        }
      }

      // Communication Preferences Detection
      const level = detectTechnicalLevel(msg.content);
      if (level !== "intermediate") {
        this.state.communicationPrefs.technicalLevel = level;
      }

      if (msg.content.length > 250) {
        this.state.communicationPrefs.preferredLength = "detailed";
      } else if (msg.content.length < 40) {
        this.state.communicationPrefs.preferredLength = "concise";
      }

      if (msg.content.includes("?")) {
        this.state.communicationPrefs.questionFrequency++;
      }

      if (msg.content.includes("```")) {
        this.state.communicationPrefs.codeShareFrequency++;
      }

      const emojiCount = (msg.content.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
      this.state.communicationPrefs.emojiUsage += emojiCount;

      // Profile Info Extraction (Heuristic)
      const nameMatch = msg.content.match(/\b(?:my\s+name\s+is|i['']?m|i\s+am|call\s+me)\s+([A-Z][a-z]+)\b/i);
      if (nameMatch?.[1]) {
        this.state.userProfile.name = nameMatch[1];
      }
      
      const roleMatch = msg.content.match(/\b(?:i\s+work\s+as|i\s+am\s+a|i['']?m\s+a)\s+([^.?!,]+)\b/i);
      if (roleMatch?.[1]) {
        const potentialRole = roleMatch[1].trim();
        if (potentialRole.length > 3 && potentialRole.length < 35) {
          this.state.userProfile.role = potentialRole;
        }
      }
    }

    // Refresh weighted counts and prune
    const now = Date.now();
    for (const topic of this.state.topics) {
      topic.recencyWeightedCount = topic.count * calculateRecencyWeight(topic.lastMentioned);
    }

    this.state.topics.sort((a, b) => b.recencyWeightedCount - a.recencyWeightedCount);
    this.state.topics = this.state.topics.slice(0, 80);

    this.state.emotionalPatterns.sort((a, b) => b.count - a.count);
    this.state.emotionalPatterns = this.state.emotionalPatterns.slice(0, 12);

    this.state.interests = this.state.topics
      .filter(t => t.count >= 2)
      .slice(0, 20)
      .map(t => t.topic);

    this.state.processedMessageKeys = pruneProcessedKeysList([...processed], 90);
    this.state.lastUpdated = now;
    saveState(this.state);
  }

  getMemorySummary(): string {
    if (this.state.topics.length === 0 && !this.state.userProfile.name) return "";

    const topTopics = this.state.topics.slice(0, 10).map(t => t.topic).join(", ");
    const interests = this.state.interests.length > 0
      ? `User Interests: ${this.state.interests.join(", ")}`
      : "";
    const level = `Technical Level: ${this.state.communicationPrefs.technicalLevel}`;
    const length = `Preferred Response Style: ${this.state.communicationPrefs.preferredLength}`;

    const parts: string[] = [
      `[Enhanced Memory — Deep User Insights]`,
      topTopics ? `Recent topics: ${topTopics}` : "",
      interests,
      level,
      length,
    ];

    if (this.state.emotionalPatterns.length > 0) {
      const topEmotions = this.state.emotionalPatterns.slice(0, 3)
        .map(e => e.emotion)
        .join(", ");
      parts.push(`Dominant emotions: ${topEmotions}`);
    }

    if (this.state.userProfile.name || this.state.userProfile.role) {
      const profile = [];
      if (this.state.userProfile.name) profile.push(`Name: ${this.state.userProfile.name}`);
      if (this.state.userProfile.role) profile.push(`Role: ${this.state.userProfile.role}`);
      parts.push(`[Identity] ${profile.join(" | ")}`);
    }

    return parts.filter(Boolean).join("\n");
  }

  clearMemory() {
    this.state = {
      topics: [],
      interests: [],
      emotionalPatterns: [],
      communicationPrefs: {
        preferredLength: "balanced",
        technicalLevel: "intermediate",
        detectedLanguages: ["en"],
        questionFrequency: 0,
        codeShareFrequency: 0,
        emojiUsage: 0,
      },
      conversationFlow: {
        avgMessagesPerConversation: 0,
        avgMessageLength: 0,
        sessionDuration: 0,
        returnRate: 0,
      },
      userProfile: {},
      lastUpdated: Date.now(),
      totalMessages: 0,
      totalConversations: 0,
      processedMessageKeys: [],
    };
    saveState(this.state);
  }

  getTopTopics(): UserTopic[] {
    return this.state.topics.slice(0, 20);
  }

  getPreferences(): CommunicationPreference {
    return this.state.communicationPrefs;
  }

  getEmotionalPatterns(): EmotionalPattern[] {
    return this.state.emotionalPatterns;
  }

  getConversationFlow(): ConversationFlow {
    return this.state.conversationFlow;
  }

  getStats(): { totalMessages: number; totalConversations: number; topicsLearned: number; lastUpdated: number } {
    return {
      totalMessages: this.state.totalMessages,
      totalConversations: this.state.totalConversations,
      topicsLearned: this.state.topics.length,
      lastUpdated: this.state.lastUpdated,
    };
  }
}

let _instance: EnhancedMemory | null = null;
export function getEnhancedMemory(): EnhancedMemory {
  if (!_instance) _instance = new EnhancedMemory();
  return _instance;
}

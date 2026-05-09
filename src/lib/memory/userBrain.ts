/**
 * User Brain & Behavioral Analysis System
 * 
 * Responsible for analyzing user interaction history to build a deep 
 * cognitive and interest profile. This profile is used by the AI to 
 * adapt its tone, complexity, and focus area.
 * 
 * Self-Learning Features:
 * - Tracks skill evolution over time (topics appearing more/less)
 * - Detects communication style shifts
 * - Builds progressive expertise model
 * - Generates adaptive response directives
 */

import { getAgentMemoryManager } from "./agentMemory";
import { getKnowledgeExtractor } from "./knowledgeExtractor";

/**
 * Keywords used to categorize user interests based on their queries.
 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  React: ["react", "next.js", "jsx", "tsx", "hooks", "usestate", "useeffect", "component"],
  Vue: ["vue", "nuxtjs", "vuex", "pinia"],
  Svelte: ["svelte", "sveltekit"],
  JavaScript: ["javascript", "js", "es6", "typescript", "ts", "node", "deno", "bun"],
  Python: ["python", "py", "django", "flask", "fastapi", "pandas", "numpy"],
  "AI/ML": ["ai", "ml", "machine learning", "tensorflow", "pytorch", "llm", "gpt", "neural", "deep learning", "transformer"],
  Styling: ["css", "tailwind", "scss", "styled-components", "styling", "ui", "ux", "design"],
  Backend: ["node.js", "server", "api", "database", "sql", "mongodb", "backend", "rest", "graphql"],
  DevOps: ["docker", "kubernetes", "ci/cd", "deployment", "aws", "cloud", "terraform"],
  Mobile: ["react native", "flutter", "swift", "kotlin", "mobile", "ios", "android"],
  Security: ["security", "auth", "encryption", "vulnerability", "csrf", "xss"],
  Data: ["data", "analytics", "visualization", "chart", "dashboard", "statistics"],
};

/**
 * Response style adaptation based on detected patterns
 */
interface AdaptiveDirective {
  responseStyle: "concise" | "balanced" | "detailed" | "tutorial";
  technicalDepth: "surface" | "moderate" | "deep" | "expert";
  preferredFormats: string[]; // e.g., ["code_examples", "bullet_points", "diagrams"]
  topicExpertise: Record<string, "novice" | "learning" | "proficient" | "expert">;
  learningVelocity: number; // 0-1, how fast user picks up new concepts
}

/**
 * Factory function to get the User Brain analysis service.
 */
export function getUserBrain() {
  return {
    /**
     * Ingests raw conversation data for processing.
     */
    ingest: async (data: { conversations: any[] }) => {
      console.log("UserBrain ingested conversations:", data.conversations.length);
    },

    /**
     * Processes a single message interaction.
     */
    processMessage: async (_query: string, _answer: string) => {
      // In a more complex implementation, we might perform real-time 
      // analysis here, but for now we rely on analyzeUser()
      console.log("UserBrain processing message");
    },

    /**
     * Gets relevant context for a query to inject into the system prompt.
     */
    getRelevantContext: async (_query: string): Promise<string> => {
      return await getUserBrain().getAdaptivePromptDirective();
    },

    /**
     * Analyzes all recorded interactions to generate a comprehensive user profile.
     * Evaluates interests, engagement level, curiosity, practical coding skills,
     * and self-learning trajectory.
     */
    analyzeUser: async () => {
      const memory = getAgentMemoryManager();
      const interactions = await memory.getInteractions();

      if (!interactions || interactions.length === 0) {
        return {
          summary: "Not enough data to analyze user.",
          strengths: [],
          truthfulAssessment: "No interactions recorded yet.",
          overallScore: 0,
          interests: [],
          quirks: [],
          adaptiveDirective: null,
          knowledgeGraphStats: null,
          interactionCount: 0,
        };
      }

      let userMessageCount = 0;
      let questionCount = 0;
      let codeBlockCount = 0;
      let totalWordCount = 0;
      let complexQueryCount = 0;
      let followUpCount = 0;
      const topicCounts: Record<string, number> = {};
      const topicTimeline: Record<string, number[]> = {}; // topic -> timestamps
      const messageComplexities: number[] = [];
      const sessionGaps: number[] = [];
      let lastTimestamp = 0;

      // Phase 1: Quantitative Analysis with temporal tracking
      for (const interaction of interactions) {
        if (interaction.role === "user" && interaction.query) {
          userMessageCount++;
          const content = interaction.query.toLowerCase();
          const wordCount = content.split(/\s+/).length;
          totalWordCount += wordCount;

          // Track session gaps for engagement analysis
          if (lastTimestamp > 0 && interaction.timestamp) {
            const gap = interaction.timestamp - lastTimestamp;
            if (gap > 0) sessionGaps.push(gap);
          }
          if (interaction.timestamp) lastTimestamp = interaction.timestamp;

          // Detect questions
          if (content.includes("?")) questionCount++;

          // Detect code blocks
          if (content.includes("```")) codeBlockCount++;

          // Detect complex queries (multi-part, referential, analytical)
          const complexity = (content.includes("?") ? 1 : 0) +
            (wordCount > 30 ? 1 : 0) +
            (content.includes("and") || content.includes("also") ? 1 : 0) +
            (/\b(compare|analyze|explain|why|how does|what if)\b/.test(content) ? 1 : 0) +
            (content.includes("```") ? 1 : 0);
          messageComplexities.push(complexity);
          if (complexity >= 3) complexQueryCount++;

          // Detect follow-up patterns
          if (/\b(also|and what about|follow up|additionally|another thing|one more)\b/.test(content)) {
            followUpCount++;
          }

          // Map to topics with temporal tracking
          for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
            if (keywords.some((kw) => content.includes(kw))) {
              topicCounts[topic] = (topicCounts[topic] || 0) + 1;
              if (!topicTimeline[topic]) topicTimeline[topic] = [];
              topicTimeline[topic].push(interaction.timestamp || Date.now());
            }
          }
        }
      }

      if (userMessageCount === 0) {
        return {
          summary: "No user messages found to analyze.",
          strengths: [],
          truthfulAssessment: "No user messages recorded yet.",
          overallScore: 0,
          interests: [],
          quirks: [],
          adaptiveDirective: null,
          knowledgeGraphStats: null,
          interactionCount: 0,
        };
      }

      // Phase 2: Qualitative Synthesis
      const strengths = [];
      const questionRatio = questionCount / userMessageCount;
      const codeRatio = codeBlockCount / userMessageCount;
      const avgWordCount = totalWordCount / userMessageCount;
      const avgComplexity = messageComplexities.reduce((a, b) => a + b, 0) / messageComplexities.length;

      if (questionRatio > 0.3) strengths.push({ description: "Inquisitive and curious" });
      if (codeRatio > 0.2) strengths.push({ description: "Hands-on, learns by doing" });
      if (Object.keys(topicCounts).length > 3) strengths.push({ description: "Explores a wide range of topics" });
      if (avgComplexity > 2.5) strengths.push({ description: "Asks sophisticated, multi-part questions" });
      if (followUpCount > 3) strengths.push({ description: "Thorough — follows up to deepen understanding" });
      if (avgWordCount > 40) strengths.push({ description: "Provides rich context in questions" });
      if (strengths.length === 0 && userMessageCount > 5) strengths.push({ description: "Consistent and focused" });

      const sortedTopics = Object.entries(topicCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([topic]) => topic);

      // Phase 2.5: Personality & Quirks Detection
      const quirks = [];
      if (userMessageCount > 10 && codeRatio < 0.05) quirks.push("All talk, no code");
      if (questionRatio > 0.4) quirks.push("Human question mark");
      if (userMessageCount > 20) quirks.push("Certified chatterbox");
      if (avgWordCount > 60) quirks.push("Writes essays, not messages");
      if (avgComplexity > 3) quirks.push("Overthinks everything (admirably)");

      const hasHumor = interactions.some(i =>
        i.query?.toLowerCase().includes("troll") ||
        i.query?.toLowerCase().includes("joke") ||
        i.query?.toLowerCase().includes("roast")
      );
      if (hasHumor) quirks.push("Enjoys a good roast");

      // Phase 3: Self-Learning — Topic Expertise Model
      const topicExpertise: Record<string, "novice" | "learning" | "proficient" | "expert"> = {};
      for (const [topic, count] of Object.entries(topicCounts)) {
        if (count >= 15) topicExpertise[topic] = "expert";
        else if (count >= 8) topicExpertise[topic] = "proficient";
        else if (count >= 3) topicExpertise[topic] = "learning";
        else topicExpertise[topic] = "novice";
      }

      // Phase 3.5: Learning velocity (how quickly topics accumulate)
      const learningVelocity = Math.min(1, Object.keys(topicCounts).length / Math.max(userMessageCount, 1) * 5);

      // Phase 4: Adaptive Directive Generation
      const adaptiveDirective: AdaptiveDirective = {
        responseStyle: avgWordCount > 50 ? "detailed" :
          avgWordCount < 15 ? "concise" :
            complexQueryCount > 5 ? "tutorial" : "balanced",
        technicalDepth: codeRatio > 0.3 ? "expert" :
          codeRatio > 0.15 ? "deep" :
            questionRatio > 0.3 ? "moderate" : "surface",
        preferredFormats: [
          ...(codeRatio > 0.1 ? ["code_examples"] : []),
          ...(questionRatio > 0.3 ? ["explanations"] : []),
          ...(avgWordCount < 20 ? ["bullet_points"] : []),
          ...(avgComplexity > 2 ? ["structured_sections"] : []),
        ],
        topicExpertise,
        learningVelocity,
      };

      // Phase 5: Knowledge graph integration
      let knowledgeGraphStats = null;
      try {
        const kg = getKnowledgeExtractor();
        knowledgeGraphStats = kg.getStats();
      } catch { /* no-op in tests */ }

      const summary = `User has had ${userMessageCount} interactions. Primary interests appear to be in ${sortedTopics.slice(0, 3).join(", ") || "various topics"}. The user shows a ${questionRatio > 0.3 ? "high" : "moderate"} level of curiosity and is ${codeRatio > 0.2 ? "very" : "somewhat"} hands-on with code.`;

      let truthfulAssessment = "User is actively engaged in learning.";
      if (questionRatio > 0.4 && codeRatio < 0.1) {
        truthfulAssessment = "User asks many questions but may be hesitant to write or share code.";
      } else if (codeRatio > 0.3 && questionRatio < 0.1) {
        truthfulAssessment = "User is proficient and tends to provide solutions rather than ask questions.";
      } else if (avgComplexity > 2.5) {
        truthfulAssessment = "User asks sophisticated questions — likely an experienced developer exploring new areas.";
      }

      // Phase 6: Engagement Scoring (improved)
      const engagementScore = Math.min(100, userMessageCount * 5);
      const curiosityScore = Math.min(100, questionRatio * 150);
      const practicalScore = Math.min(100, codeRatio * 200);
      const depthScore = Math.min(100, avgComplexity * 30);
      const overallScore = Math.round(
        (engagementScore * 0.2 + curiosityScore * 0.25 + practicalScore * 0.25 + depthScore * 0.3)
      );

      // Phase 7: Knowledge Gaps (Self-Learning Research Topics)
      const knowledgeGaps: string[] = [];
      const userInterests = Object.keys(topicCounts);
      for (const [topic] of Object.entries(TOPIC_KEYWORDS)) {
        if (!userInterests.includes(topic)) {
          // If user hasn't asked about this but has asked about related topics
          const relatedTopics = {
            "AI/ML": ["Data", "Python"],
            "DevOps": ["Backend", "Security"],
            "Mobile": ["JavaScript", "Styling"],
            "Security": ["Backend", "DevOps"],
          };
          for (const [parent, children] of Object.entries(relatedTopics)) {
             if (userInterests.includes(parent) && topic === children[0]) {
                knowledgeGaps.push(topic);
             }
          }
        }
      }

      return {
        summary,
        strengths,
        truthfulAssessment,
        overallScore,
        interests: sortedTopics,
        quirks,
        adaptiveDirective,
        knowledgeGraphStats,
        knowledgeGaps: knowledgeGaps.slice(0, 3),
        interactionCount: userMessageCount,
      };
    },

    /**
     * Generate an adaptive system prompt directive based on user analysis.
     * This is injected into the AI system prompt for personalization.
     */
    getAdaptivePromptDirective: async (): Promise<string> => {
      const analysis = await getUserBrain().analyzeUser();
      if (!analysis.adaptiveDirective || analysis.interactionCount < 3) return "";

      const d = analysis.adaptiveDirective;
      const parts: string[] = [
        `[User Adaptation — Self-Learned from ${analysis.interactionCount} interactions]`,
      ];

      if (d.responseStyle === "detailed") parts.push("• User prefers detailed, thorough responses");
      if (d.responseStyle === "concise") parts.push("• User prefers brief, to-the-point responses");
      if (d.responseStyle === "tutorial") parts.push("• User learns best with step-by-step tutorials");
      if (d.technicalDepth === "expert") parts.push("• User is technically advanced — skip basics, go deep");
      if (d.technicalDepth === "surface") parts.push("• User is a beginner — explain concepts simply");

      const expertTopics = Object.entries(d.topicExpertise)
        .filter(([, level]) => level === "proficient" || level === "expert")
        .map(([topic]) => topic);
      if (expertTopics.length > 0) {
        parts.push(`• Strong in: ${expertTopics.join(", ")}`);
      }

      if (d.preferredFormats.length > 0) {
        parts.push(`• Preferred response format: ${d.preferredFormats.join(", ")}`);
      }

      return parts.join("\n");
    },
  };
}
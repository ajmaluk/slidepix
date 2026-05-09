/**
 * Emotional Intelligence System
 * 
 * Provides honest, truthful feedback with emotional awareness.
 * Incorporates psychological and physiological state detection to:
 * - Detect user emotional state accurately
 * - Provide constructive criticism when needed
 * - Identify flow state, burnout, or cognitive overload
 * - Adapt tone based on psychological needs for better productivity
 * - Points out weaknesses and areas for improvement
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface EmotionDetectionResult {
  // Primary emotion
  primaryEmotion: Emotion;
  emotionIntensity: number; // 0-1
  
  // Secondary emotions
  secondaryEmotions: { emotion: Emotion; intensity: number }[];
  
  // Psychological/Physiological indicators
  cognitiveState: CognitiveState;
  physiologicalIndicators: PhysiologicalIndicator[];
  
  // Emotional metadata
  polarity: "positive" | "neutral" | "negative";
  arousal: number; // 0-1, energy level
  dominance: number; // 0-1, sense of control
  
  // Context
  triggers: string[];
  indicators: string[];
  confidence: number;
}

export type Emotion =
  | "joy" | "sadness" | "anger" | "fear" | "surprise" | "disgust"
  | "trust" | "anticipation" | "frustrated" | "confused" | "excited"
  | "anxious" | "confident" | "curious" | "bored" | "stressed"
  | "calm" | "neutral" | "guilty" | "shame" | "proud" | "lonely"
  | "overwhelmed" | "inspired" | "burnt-out";

export type CognitiveState = 
  | "flow" | "distracted" | "focused" | "confused" | "overloaded" | "bored" | "normal";

export type PhysiologicalIndicator = 
  | "tired" | "energetic" | "tense" | "relaxed" | "rushed" | "steady";

export interface FeedbackStyle {
  honesty: number; // 0-1, how direct/truthful
  empathy: number; // 0-1, emotional sensitivity
  encouragement: number; // 0-1, motivational tone
  criticism: number; // 0-1, critical feedback level
  
  tone: "supportive" | "direct" | "balanced" | "tough-love" | "gentle" | "coach-like";
  approach: "motivate" | "reality-check" | "educate" | "challenge" | "rehabilitate";
}

export interface HonestFeedback {
  message: string;
  style: FeedbackStyle;
  reasoning: string;
  
  // What we're addressing
  issuesToAddress: string[];
  strengthsToAcknowledge: string[];
  
  // Emotional considerations
  userEmotionalState: EmotionDetectionResult;
  appropriateForState: boolean;
  
  // Actionability
  actionableSteps: string[];
  priorityLevel: "high" | "medium" | "low";
}

export interface ResponseTone {
  directness: number; // 0-1
  warmth: number; // 0-1
  formality: number; // 0-1
  
  shouldEncourage: boolean;
  shouldChallenge: boolean;
  shouldValidate: boolean;
  shouldCritique: boolean;
  
  rationale: string;
}

// ─── Emotional Intelligence Engine ──────────────────────────────────

export class EmotionalIntelligenceEngine {
  /**
   * Detect emotional state from message (Router Alias)
   */
  processInteraction(message: string): EmotionDetectionResult {
    return this.detectEmotion(message);
  }

  /**
   * Detect emotional state from message
   */
  detectEmotion(message: string): EmotionDetectionResult {
    const lowerMsg = message.toLowerCase();

    // Emotion indicators
    const emotionKeywords = this.getEmotionKeywords();
    const detectedEmotions = new Map<Emotion, number>();

    // Scan for emotion keywords
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        if (lowerMsg.includes(keyword)) {
          score += 1;
        }
      }
      if (score > 0) {
        detectedEmotions.set(emotion as Emotion, score);
      }
    }

    // Analyze punctuation for intensity
    const exclamationCount = (message.match(/!/g) || []).length;
    const capsRatio = (message.match(/[A-Z]/g) || []).length / (message.length || 1);

    const intensityModifier = 1 + exclamationCount * 0.2 + capsRatio * 0.5;

    // Determine primary emotion
    let primaryEmotion: Emotion = "neutral";
    let maxScore = 0;

    for (const [emotion, score] of detectedEmotions.entries()) {
      const adjustedScore = score * intensityModifier;
      if (adjustedScore > maxScore) {
        maxScore = adjustedScore;
        primaryEmotion = emotion;
      }
    }

    // Calculate intensity
    const emotionIntensity = Math.min(maxScore / 5, 1);

    // Secondary emotions
    const secondaryEmotions = Array.from(detectedEmotions.entries())
      .filter(([e]) => e !== primaryEmotion)
      .map(([emotion, score]) => ({
        emotion,
        intensity: Math.min((score * intensityModifier) / 5, 1),
      }))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 3);

    // Detect Cognitive and Physiological states
    const cognitiveState = this.detectCognitiveState(lowerMsg);
    const physiologicalIndicators = this.detectPhysiologicalIndicators(lowerMsg);

    // Polarity analysis
    const polarity = this.determinePolarity(primaryEmotion, lowerMsg);

    // Arousal (energy) and dominance (control)
    const arousal = this.calculateArousal(primaryEmotion);
    const dominance = this.calculateDominance(primaryEmotion);

    // Identify triggers and indicators
    const triggers = this.identifyTriggers(lowerMsg);
    const indicators = this.identifyIndicators(message);

    // Confidence in detection
    const confidence = this.calculateConfidence(
      emotionIntensity,
      detectedEmotions.size,
      indicators.length
    );

    return {
      primaryEmotion,
      emotionIntensity,
      secondaryEmotions,
      cognitiveState,
      physiologicalIndicators,
      polarity,
      arousal,
      dominance,
      triggers,
      indicators,
      confidence,
    };
  }

  /**
   * Determine appropriate feedback style based on user state and context
   */
  determineFeedbackStyle(
    userEmotion: EmotionDetectionResult
  ): FeedbackStyle {
    // Default: balanced approach
    let honesty = 0.7;
    let empathy = 0.6;
    let encouragement = 0.5;
    let criticism = 0.5;
    let tone: FeedbackStyle["tone"] = "balanced";
    let approach: FeedbackStyle["approach"] = "educate";

    // Adjust based on cognitive state
    if (userEmotion.cognitiveState === "flow") {
      honesty = 0.9;
      empathy = 0.4;
      criticism = 0.3;
      encouragement = 0.2; // Don't interrupt flow with fluff
      tone = "direct";
      approach = "challenge";
    } else if (userEmotion.cognitiveState === "overloaded") {
      honesty = 0.5;
      empathy = 0.9;
      criticism = 0.1;
      encouragement = 0.8;
      tone = "supportive";
      approach = "rehabilitate";
    }

    // Adjust based on physiological indicators
    if (userEmotion.physiologicalIndicators.includes("tired")) {
      empathy = 0.8;
      criticism = 0.2;
      encouragement = 0.7;
      tone = "gentle";
    }

    // Adjust based on emotional state
    if (userEmotion.polarity === "negative") {
      if (userEmotion.emotionIntensity > 0.7) {
        empathy = 0.9;
        criticism = 0.3;
        encouragement = 0.7;
        honesty = 0.6;
        tone = "supportive";
        approach = "motivate";
      } else {
        empathy = 0.7;
        criticism = 0.5;
        encouragement = 0.6;
        honesty = 0.7;
        tone = "balanced";
      }
    } else if (userEmotion.polarity === "positive") {
      honesty = 0.8;
      criticism = 0.7;
      encouragement = 0.6;
      empathy = 0.5;
      tone = "coach-like";
      approach = "challenge";
    }

    // Specific emotion overrides
    switch (userEmotion.primaryEmotion) {
      case "frustrated":
      case "anger":
        empathy = 0.8;
        honesty = 0.7;
        criticism = 0.4;
        encouragement = 0.5;
        tone = "supportive";
        break;
      case "confused":
        honesty = 0.9;
        empathy = 0.6;
        criticism = 0.3;
        encouragement = 0.5;
        approach = "educate";
        break;
      case "burnt-out":
        empathy = 1.0;
        honesty = 0.4;
        criticism = 0.0;
        encouragement = 0.9;
        tone = "gentle";
        approach = "rehabilitate";
        break;
    }

    return { honesty, empathy, criticism, encouragement, tone, approach };
  }

  /**
   * Generate honest feedback message with psychological depth
   */
  generateHonestFeedback(
    style: FeedbackStyle,
    issues: string[],
    strengths: string[],
    userEmotion: EmotionDetectionResult
  ): HonestFeedback {
    const sections: string[] = [];

    // Opening based on tone
    if (style.tone === "supportive") {
      sections.push("I can tell you're navigating a lot right now.");
    } else if (style.tone === "direct") {
      sections.push("Let's get straight to the point:");
    } else if (style.tone === "tough-love") {
      sections.push("You need to hear this, even if it's uncomfortable:");
    } else if (style.tone === "coach-like") {
      sections.push("You're performing well, but we can sharpen this:");
    }

    // Address cognitive state
    if (userEmotion.cognitiveState === "overloaded") {
      sections.push("It looks like you're experiencing some cognitive overload.");
    } else if (userEmotion.cognitiveState === "flow") {
      sections.push("You're in a great rhythm here.");
    }

    // Address strengths briefly
    if (strengths.length > 0 && style.encouragement > 0.4) {
      const strengthText = strengths.length === 1 ? strengths[0] : `${strengths.slice(0, 2).join(" and ")}`;
      sections.push(`Your ${strengthText} is a clear asset.`);
    }

    // Core honest feedback
    if (issues.length > 0) {
      if (style.honesty > 0.7) {
        sections.push(`\n**The Reality:** ${issues[0].toLowerCase()}`);
        if (issues.length > 1) {
          sections.push(`Also, consider addressing: ${issues.slice(1, 3).map((i) => i.toLowerCase()).join(", ")}.`);
        }
      } else {
        sections.push(`\nThere are a few areas where we could see better results: ${issues.join(", ")}`);
      }
    }

    // Actionable steps
    const actions = this.generateActionableSteps(issues, userEmotion);
    if (actions.length > 0) {
      sections.push(`\n**Productivity Plan:**`);
      sections.push(actions.map((a, i) => `${i + 1}. ${a}`).join("\n"));
    }

    // Closing based on approach
    if (style.approach === "challenge") {
      sections.push("\nYou're capable of more. Prove it in the next step.");
    } else if (style.approach === "rehabilitate") {
      sections.push("\nTake a short break. Your productivity will thank you.");
    } else if (style.approach === "reality-check") {
      sections.push("\nThis assessment is meant to align your efforts with the truth.");
    }

    const message = sections.join(" ");

    return {
      message,
      style,
      reasoning: `Tone: ${style.tone}, Approach: ${style.approach}. User is ${userEmotion.primaryEmotion} and appears ${userEmotion.cognitiveState}.`,
      issuesToAddress: issues,
      strengthsToAcknowledge: strengths,
      userEmotionalState: userEmotion,
      appropriateForState: this.isAppropriateForState(style, userEmotion),
      actionableSteps: actions,
      priorityLevel: issues.length > 2 ? "high" : issues.length > 0 ? "medium" : "low",
    };
  }

  /**
   * Determine appropriate response tone
   */
  determineResponseTone(userEmotion: EmotionDetectionResult): ResponseTone {
    const feedbackStyle = this.determineFeedbackStyle(userEmotion);

    const shouldEncourage = userEmotion.polarity === "negative" && userEmotion.emotionIntensity > 0.6;
    const shouldChallenge = userEmotion.primaryEmotion === "confident" || userEmotion.cognitiveState === "flow";
    const shouldValidate = userEmotion.primaryEmotion === "frustrated" || userEmotion.primaryEmotion === "overwhelmed";
    const shouldCritique = feedbackStyle.criticism > 0.6 && userEmotion.polarity !== "negative";

    const directness = feedbackStyle.honesty;
    const warmth = feedbackStyle.empathy;
    const formality = userEmotion.cognitiveState === "flow" ? 0.2 : 0.4;

    const rationale = `User is ${userEmotion.primaryEmotion} (${(userEmotion.emotionIntensity * 100).toFixed(0)}% intensity). State: ${userEmotion.cognitiveState}. Tone: ${feedbackStyle.tone}.`;

    return {
      directness,
      warmth,
      formality,
      shouldEncourage,
      shouldChallenge,
      shouldValidate,
      shouldCritique,
      rationale,
    };
  }

  /**
   * Generates a supportive context string based on the emotional state
   */
  getSupportiveContext(emotion: EmotionDetectionResult): string {
    const tone = this.determineResponseTone(emotion);
    const parts = [
      `[Emotional Context]`,
      `• User appears to be feeling: ${emotion.primaryEmotion} (${(emotion.emotionIntensity * 100).toFixed(0)}% intensity)`,
      `• Cognitive state: ${emotion.cognitiveState}`,
      `• Recommended approach: ${tone.rationale}`
    ];
    
    if (tone.shouldEncourage) parts.push("• Direct directive: Provide additional encouragement and positive reinforcement.");
    if (tone.shouldChallenge) parts.push("• Direct directive: Push the user to improve or consider more advanced perspectives.");
    if (tone.shouldValidate) parts.push("• Direct directive: Acknowledge the user's feelings and validate their experience.");
    
    return parts.join("\n");
  }

  // ─── Internal Detection Helpers ─────────────────────────────────

  private detectCognitiveState(text: string): CognitiveState {
    if (/(stuck|overwhelmed|too much|lost|cannot think|frozen)/i.test(text)) return "overloaded";
    if (/(focused|in the zone|rhythm|making progress|smoothly)/i.test(text)) return "flow";
    if (/(don't know|unclear|what|confused|why)/i.test(text)) return "confused";
    if (/(bored|boring|nothing to do|dull)/i.test(text)) return "bored";
    if (/(doing 5 things|multitasking|distracted|interrupt)/i.test(text)) return "distracted";
    return "normal";
  }

  private detectPhysiologicalIndicators(text: string): PhysiologicalIndicator[] {
    const indicators: PhysiologicalIndicator[] = [];
    if (/(tired|sleepy|exhausted|no energy|nap)/i.test(text)) indicators.push("tired");
    if (/(energetic|pumped|ready|fast|quick)/i.test(text)) indicators.push("energetic");
    if (/(tense|stressed|tight|anxious|headache)/i.test(text)) indicators.push("tense");
    if (/(relaxed|chill|calm|easy)/i.test(text)) indicators.push("relaxed");
    if (/(rushed|hurry|asap|quickly|fast)/i.test(text)) indicators.push("rushed");
    return indicators;
  }

  private getEmotionKeywords(): Record<Emotion, string[]> {
    return {
      joy: ["happy", "great", "excellent", "wonderful", "amazing", "love"],
      sadness: ["sad", "unhappy", "disappointed", "depressed", "down"],
      anger: ["angry", "mad", "furious", "annoyed", "irritated", "stupid", "wrong"],
      fear: ["afraid", "scared", "worried", "anxious", "nervous"],
      surprise: ["surprised", "shocked", "unexpected", "amazed"],
      disgust: ["disgusted", "awful", "terrible", "horrible"],
      trust: ["trust", "rely", "confident", "sure"],
      anticipation: ["excited", "looking forward", "can't wait", "eager"],
      frustrated: ["frustrated", "annoying", "stuck", "not working", "broken", "issue", "problem"],
      confused: ["confused", "don't understand", "unclear", "lost", "not clear", "can't follow"],
      excited: ["excited", "thrilled", "pumped", "enthusiastic", "can't wait"],
      anxious: ["anxious", "worried", "nervous", "concerned"],
      confident: ["confident", "sure", "definitely", "know", "certain"],
      curious: ["curious", "wonder", "interested", "want to learn", "explore"],
      bored: ["bored", "boring", "dull", "uninteresting"],
      stressed: ["stressed", "pressure", "overwhelmed", "too much", "heavy stressed"],
      calm: ["calm", "peaceful", "relaxed", "fine"],
      guilty: ["sorry", "my fault", "apologize", "regret", "should have"],
      shame: ["embarrassed", "shame", "foolish", "guilty"],
      proud: ["proud", "accomplished", "did it", "win", "success"],
      lonely: ["lonely", "alone", "no one", "isolated"],
      overwhelmed: ["too much", "cannot handle", "drowning", "overloaded"],
      inspired: ["inspired", "idea", "creative", "vision"],
      "burnt-out": ["burnt out", "exhausted", "cannot anymore", "done with everything"],
      neutral: [],
    };
  }

  private determinePolarity(emotion: Emotion, text: string): "positive" | "neutral" | "negative" {
    const positiveEmotions: Emotion[] = ["joy", "trust", "anticipation", "excited", "confident", "curious", "calm", "proud", "inspired"];
    const negativeEmotions: Emotion[] = ["sadness", "anger", "fear", "disgust", "frustrated", "confused", "anxious", "bored", "stressed", "guilty", "shame", "lonely", "overwhelmed", "burnt-out"];

    if (positiveEmotions.includes(emotion)) return "positive";
    if (negativeEmotions.includes(emotion)) return "negative";

    const positiveWords = /(good|great|excellent|happy|love|nice|wonderful|best|better)/i;
    const negativeWords = /(bad|wrong|terrible|hate|problem|issue|error|fail|fail)/i;

    if (positiveWords.test(text)) return "positive";
    if (negativeWords.test(text)) return "negative";

    return "neutral";
  }

  private calculateArousal(emotion: Emotion): number {
    const highArousal: Emotion[] = ["anger", "fear", "surprise", "excited", "frustrated", "anxious", "stressed", "inspired", "overwhelmed"];
    const lowArousal: Emotion[] = ["sadness", "bored", "calm", "neutral", "burnt-out", "lonely"];
    if (highArousal.includes(emotion)) return 0.8;
    if (lowArousal.includes(emotion)) return 0.3;
    return 0.5;
  }

  private calculateDominance(emotion: Emotion): number {
    const highDominance: Emotion[] = ["joy", "confident", "trust", "calm", "proud", "inspired"];
    const lowDominance: Emotion[] = ["fear", "anxious", "confused", "frustrated", "stressed", "overwhelmed", "shame", "burnt-out"];
    if (highDominance.includes(emotion)) return 0.8;
    if (lowDominance.includes(emotion)) return 0.3;
    return 0.5;
  }

  private identifyTriggers(text: string): string[] {
    const triggers: string[] = [];
    if (/(error|bug|broken|not working)/i.test(text)) triggers.push("Technical issues");
    if (/(deadline|urgent|quickly|asap)/i.test(text)) triggers.push("Time pressure");
    if (/(don't understand|confused|unclear)/i.test(text)) triggers.push("Lack of clarity");
    if (/(stuck|can't|unable)/i.test(text)) triggers.push("Feeling stuck");
    return triggers;
  }

  private identifyIndicators(text: string): string[] {
    const indicators: string[] = [];
    if (/!{2,}/.test(text)) indicators.push("Multiple exclamations");
    if (/\?{2,}/.test(text)) indicators.push("Multiple questions");
    if (/[A-Z]{3,}/.test(text)) indicators.push("All caps usage");
    if (text.length < 20) indicators.push("Very brief message");
    if (text.length > 500) indicators.push("Very long message");
    return indicators;
  }

  private calculateConfidence(intensity: number, emotionCount: number, indicatorCount: number): number {
    const base = intensity * 0.5;
    const fromCount = Math.min(emotionCount * 0.15, 0.3);
    const fromIndicators = Math.min(indicatorCount * 0.05, 0.2);
    return Math.min(base + fromCount + fromIndicators, 1);
  }

  private isAppropriateForState(style: FeedbackStyle, emotion: EmotionDetectionResult): boolean {
    if (emotion.polarity === "negative" && emotion.emotionIntensity > 0.8 && style.criticism > 0.7) return false;
    if ((emotion.primaryEmotion === "anxious" || emotion.primaryEmotion === "stressed" || emotion.primaryEmotion === "overwhelmed") && emotion.emotionIntensity > 0.7 && style.tone === "tough-love") return false;
    return true;
  }

  private generateActionableSteps(issues: string[], emotion: EmotionDetectionResult): string[] {
    const steps: string[] = [];
    
    // Cognitive load specific advice
    if (emotion.cognitiveState === "overloaded") {
      steps.push("Pause: Close all unnecessary tabs and focus on just one sub-task for 10 minutes.");
    }

    for (const issue of issues.slice(0, 3)) {
      const lowerIssue = issue.toLowerCase();
      if (lowerIssue.includes("communication")) {
        steps.push("Be more specific: Define the exact outcome you want from this interaction.");
      } else if (lowerIssue.includes("understanding")) {
        steps.push("Research fundamental principles of this topic before diving into details.");
      } else if (lowerIssue.includes("patience")) {
        steps.push("Strategic Wait: Allow the AI to finish its full chain of thought before responding.");
      } else {
        steps.push(`Address: ${issue}`);
      }
    }

    if (emotion.physiologicalIndicators.includes("tired")) {
      steps.push("Bio-hack: Drink a glass of water and stand up for 2 minutes to reset cognitive focus.");
    }

    return steps;
  }
}

let emotionalIntelligenceInstance: EmotionalIntelligenceEngine | null = null;

export function getEmotionalIntelligence(): EmotionalIntelligenceEngine {
  if (!emotionalIntelligenceInstance) {
    emotionalIntelligenceInstance = new EmotionalIntelligenceEngine();
  }
  return emotionalIntelligenceInstance;
}

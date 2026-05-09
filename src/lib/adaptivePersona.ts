import type { EmotionDetectionResult } from "@/lib/emotionalIntelligence";

export type PersonaVerbosity = "concise" | "balanced" | "detailed";

export type AdaptivePersonaState = {
  v: 1;
  conversationId: string;
  warmth: number;
  directness: number;
  formality: number;
  encouragement: number;
  verbosity: PersonaVerbosity;
  allowEmoji: boolean;
  mirrorEmotion: boolean;
  emotionHistory: string[];
  lastUpdated: number;
};

const DEFAULT_STATE = {
  warmth: 0.65,
  directness: 0.7,
  formality: 0.35,
  encouragement: 0.55,
  verbosity: "balanced" as const,
  allowEmoji: false,
  mirrorEmotion: true,
};

const memoryCache = new Map<string, AdaptivePersonaState>();

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function ema(prev: number, next: number, alpha: number) {
  return prev + (next - prev) * alpha;
}

function lsKey(conversationId: string) {
  return `dalam_adaptive_persona_v1:${conversationId}`;
}

function parseBooleanInstruction(text: string, on: RegExp, off: RegExp): boolean | null {
  const t = text.toLowerCase();
  if (off.test(t)) return false;
  if (on.test(t)) return true;
  return null;
}

function extractVerbosityInstruction(text: string): PersonaVerbosity | null {
  const t = text.toLowerCase();
  if (/\b(concise|short|brief|tldr)\b/.test(t)) return "concise";
  if (/\b(detailed|deep|in depth|step by step|thorough)\b/.test(t)) return "detailed";
  if (/\b(balanced|normal length|medium length)\b/.test(t)) return "balanced";
  return null;
}

function estimateUserFormalitySignal(text: string): number | null {
  const t = text;
  const hasSlang = /\b(yo|bro|dude|lol|lmao|idk|imo|pls|plz|thx|ty)\b/i.test(t);
  const hasPolite = /\b(please|kindly|thank you|thanks)\b/i.test(t);
  const hasProf = /\b(regarding|therefore|accordingly|furthermore)\b/i.test(t);
  if (hasSlang) return 0.15;
  if (hasProf) return 0.6;
  if (hasPolite) return 0.45;
  return null;
}

function estimateEmojiPreference(text: string): boolean | null {
  const wants = parseBooleanInstruction(text, /\b(use emojis|with emojis|add emojis)\b/i, /\b(no emojis|dont use emojis|don't use emojis|without emojis)\b/i);
  if (wants !== null) return wants;
  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  if (emojiCount >= 2) return true;
  return null;
}

function computeEmotionTargets(emotion?: EmotionDetectionResult) {
  if (!emotion) {
    return {
      warmth: DEFAULT_STATE.warmth,
      directness: DEFAULT_STATE.directness,
      encouragement: DEFAULT_STATE.encouragement,
    };
  }

  const intensity = clamp01(emotion.emotionIntensity || 0);
  const negative = emotion.polarity === "negative";
  const overloaded = emotion.cognitiveState === "overloaded";
  const flow = emotion.cognitiveState === "flow";
  const confused = emotion.primaryEmotion === "confused";

  const warmth = negative ? 0.75 + 0.15 * intensity : 0.55 + 0.05 * intensity;
  const encouragement = negative ? 0.7 + 0.25 * intensity : 0.45 + 0.1 * intensity;
  let directness = negative ? 0.65 : 0.75;
  if (overloaded) directness -= 0.15;
  if (flow) directness += 0.1;
  if (confused) directness -= 0.1;

  return {
    warmth: clamp01(warmth),
    directness: clamp01(directness),
    encouragement: clamp01(encouragement),
  };
}

export function loadAdaptivePersonaState(conversationId: string, isGuest: boolean): AdaptivePersonaState {
  const cached = memoryCache.get(conversationId);
  if (cached) return cached;

  if (!isGuest) {
    try {
      const raw = localStorage.getItem(lsKey(conversationId));
      if (raw) {
        const parsed = JSON.parse(raw) as AdaptivePersonaState;
        if (parsed && parsed.v === 1 && parsed.conversationId === conversationId) {
          memoryCache.set(conversationId, parsed);
          return parsed;
        }
      }
    } catch (err) {
      void err;
    }
  }

  const next: AdaptivePersonaState = {
    v: 1,
    conversationId,
    ...DEFAULT_STATE,
    emotionHistory: [],
    lastUpdated: Date.now(),
  };
  memoryCache.set(conversationId, next);
  return next;
}

export function saveAdaptivePersonaState(state: AdaptivePersonaState, isGuest: boolean) {
  memoryCache.set(state.conversationId, state);
  if (isGuest) return;
  try {
    localStorage.setItem(lsKey(state.conversationId), JSON.stringify(state));
  } catch (err) {
    void err;
  }
}

export function evolveAdaptivePersona(
  prev: AdaptivePersonaState,
  userMessage: string,
  emotion?: EmotionDetectionResult
): AdaptivePersonaState {
  const alpha = clamp01(0.08 + 0.22 * clamp01(emotion?.confidence ?? 0.4));
  const targets = computeEmotionTargets(emotion);

  const verbosity = extractVerbosityInstruction(userMessage) ?? prev.verbosity;
  const allowEmoji = estimateEmojiPreference(userMessage) ?? prev.allowEmoji;
  const mirrorEmotion = parseBooleanInstruction(userMessage, /\b(mirror my mood|match my tone|be more empathetic)\b/i, /\b(don't mirror|dont mirror|stop being emotional)\b/i) ?? prev.mirrorEmotion;
  const formalitySignal = estimateUserFormalitySignal(userMessage);

  const nextHistory = [...(prev.emotionHistory || [])];
  if (emotion?.primaryEmotion) {
    nextHistory.push(String(emotion.primaryEmotion));
    while (nextHistory.length > 12) nextHistory.shift();
  }

  return {
    ...prev,
    warmth: clamp01(ema(prev.warmth, targets.warmth, alpha)),
    directness: clamp01(ema(prev.directness, targets.directness, alpha)),
    encouragement: clamp01(ema(prev.encouragement, targets.encouragement, alpha)),
    formality: clamp01(formalitySignal === null ? prev.formality : ema(prev.formality, formalitySignal, 0.18)),
    verbosity,
    allowEmoji,
    mirrorEmotion,
    emotionHistory: nextHistory,
    lastUpdated: Date.now(),
  };
}

function describeScale(value: number, labels: [string, string, string]) {
  if (value <= 0.33) return labels[0];
  if (value <= 0.66) return labels[1];
  return labels[2];
}

function summarizeEmotionTrend(history: string[]) {
  if (!history || history.length === 0) return "";
  const last = history.slice(-6);
  const freq = new Map<string, number>();
  for (const e of last) freq.set(e, (freq.get(e) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return "";
  const stability = top[1] >= 4 ? "stable" : top[1] >= 3 ? "moderate" : "mixed";
  return `Recent emotion trend: ${top[0]} (${stability}).`;
}

export function buildAdaptivePersonaBlock(state: AdaptivePersonaState): string {
  const warmthLabel = describeScale(state.warmth, ["cool", "warm", "very warm"]);
  const directnessLabel = describeScale(state.directness, ["gentle", "balanced", "very direct"]);
  const formalityLabel = describeScale(state.formality, ["casual", "neutral", "formal"]);
  const encouragementLabel = describeScale(state.encouragement, ["low", "medium", "high"]);
  const trend = summarizeEmotionTrend(state.emotionHistory);

  const styleLine =
    state.verbosity === "concise"
      ? "Prefer concise answers; expand only if asked."
      : state.verbosity === "detailed"
        ? "Prefer thorough, structured answers with steps and checks."
        : "Keep answers balanced in length and depth.";

  const emojiLine = state.allowEmoji ? "Emojis allowed sparingly when it adds warmth." : "Avoid emojis unless the user uses them heavily or asks.";
  const mirrorLine = state.mirrorEmotion
    ? "Mirror the user's emotional tone subtly (validate → then solve)."
    : "Keep tone steady and solution-focused; avoid emotional mirroring.";

  return [
    "[Adaptive Persona Profile]",
    `- Warmth: ${warmthLabel}. Directness: ${directnessLabel}. Formality: ${formalityLabel}. Encouragement: ${encouragementLabel}.`,
    `- Response length: ${state.verbosity}.`,
    `- ${styleLine}`,
    `- ${mirrorLine}`,
    `- ${emojiLine}`,
    "- If the user explicitly asks for a different style, follow it and adapt this profile.",
    trend ? `- ${trend}` : "",
  ].filter(Boolean).join("\n");
}

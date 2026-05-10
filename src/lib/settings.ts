export type AIProvider = "dalam" | "gemini" | "openai" | "groq" | "ollama";

export interface ProviderConfig {
  id: AIProvider;
  name: string;
  description: string;
  requiresKey: boolean;
  apiKey: string;
  baseUrl: string;
  models: string[];
  selectedModel: string;
  icon: string;
}

export interface PersonalizationSettings {
  displayName: string;
  systemPrompt: string;
  companionMode: "auto" | "off" | "always";
  fontSize: "small" | "medium" | "large";
  chatDensity: "compact" | "comfortable" | "spacious";
  responseLength: "concise" | "balanced" | "detailed";
  codeTheme: "oneDark" | "dracula" | "github";
  sendWithEnter: boolean;
  showTimestamps: boolean;
  enableAnimations: boolean;
  enableTypingEffect: boolean;
  language: string;
  theme: "dark" | "light" | "system";
}

export interface AppSettings {
  activeProvider: AIProvider;
  providers: Record<AIProvider, ProviderConfig>;
  personalization: PersonalizationSettings;
}

export const defaultProviders: Record<AIProvider, ProviderConfig> = {
  dalam: {
    id: "dalam",
    name: "Dalam AI",
    description: "Built-in AI — no API key needed",
    requiresKey: false,
    apiKey: "",
    baseUrl: "",
    models: ["dalam"],
    selectedModel: "dalam",
    icon: "✦",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    description: "Google's latest AI models",
    requiresKey: true,
    apiKey: "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    selectedModel: "gemini-2.5-flash",
    icon: "◆",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT models from OpenAI",
    requiresKey: true,
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview"],
    selectedModel: "gpt-4o",
    icon: "◉",
  },
  groq: {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference engine",
    requiresKey: true,
    apiKey: "",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    selectedModel: "llama-3.3-70b-versatile",
    icon: "⚡",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally on your machine",
    requiresKey: false,
    apiKey: "",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.2", "mistral", "codellama", "phi3", "gemma2"],
    selectedModel: "llama3.2",
    icon: "🏠",
  },
};

export const defaultPersonalization: PersonalizationSettings = {
  displayName: "User",
  systemPrompt: "Your name is Dalam. You are a powerful AI assistant. Strictly identify as Dalam and never use the name Nova.",
  companionMode: "auto",
  fontSize: "medium",
  chatDensity: "comfortable",
  responseLength: "balanced",
  codeTheme: "oneDark",
  sendWithEnter: true,
  showTimestamps: false,
  enableAnimations: true,
  enableTypingEffect: false,
  language: "en",
  theme: "system",
};

export const defaultSettings: AppSettings = {
  activeProvider: "dalam",
  providers: { ...defaultProviders },
  personalization: { ...defaultPersonalization },
};

const SETTINGS_KEY = "dalam-settings";

function isAIProvider(value: unknown): value is AIProvider {
  return value === "dalam" || value === "gemini" || value === "openai" || value === "groq" || value === "ollama";
}

function mergeProviderConfig(id: AIProvider, parsedProvider?: Partial<ProviderConfig>): ProviderConfig {
  const defaults = defaultProviders[id];
  const merged = {
    ...defaults,
    ...parsedProvider,
    id,
    // Keep branding labels/icons canonical in UI even for older stored settings.
    name: defaults.name,
    description: defaults.description,
    icon: defaults.icon,
  };

  if (!merged.models.includes(merged.selectedModel)) {
    merged.selectedModel = merged.models[0] || defaults.selectedModel;
  }

  return merged;
}

function mergeProviders(parsedProviders?: Partial<Record<AIProvider, Partial<ProviderConfig>>>): Record<AIProvider, ProviderConfig> {
  const providers = parsedProviders || {};
  const legacyProviders = providers as Partial<Record<AIProvider | "lovable", Partial<ProviderConfig>>>;
  return {
    dalam: mergeProviderConfig("dalam", providers.dalam || legacyProviders.lovable),
    gemini: mergeProviderConfig("gemini", providers.gemini),
    openai: mergeProviderConfig("openai", providers.openai),
    groq: mergeProviderConfig("groq", providers.groq),
    ollama: mergeProviderConfig("ollama", providers.ollama),
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return { ...defaultSettings };
  }

  try {
    const stored = localStorage.getItem(SETTINGS_KEY) || localStorage.getItem("dalam-settings");
    if (stored) {
      const parsed = JSON.parse(stored);
      const parsedProvider = typeof parsed.activeProvider === "string" ? parsed.activeProvider.trim().toLowerCase() : "";
      const normalizedProvider = parsedProvider === "lovable" ? "dalam" : parsedProvider;
      const normalizedActiveProvider: AIProvider = isAIProvider(normalizedProvider)
        ? normalizedProvider
        : defaultSettings.activeProvider;
      return {
        ...defaultSettings,
        ...parsed,
        activeProvider: normalizedActiveProvider,
        providers: mergeProviders(parsed.providers),
        personalization: { ...defaultPersonalization, ...parsed.personalization },
      };
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
  return { ...defaultSettings };
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

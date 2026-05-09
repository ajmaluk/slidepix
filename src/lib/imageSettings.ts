export type ImageProvider = "dalam" | "freepik" | "openai" | "stability" | "replicate";

export type FreepikAspectRatio =
  | "square_1_1"
  | "portrait_2_3"
  | "portrait_3_4"
  | "landscape_3_2"
  | "landscape_4_3"
  | "widescreen_16_9";

export type FreepikResolution = "1k" | "2k";
export type FreepikEngine = "automatic" | "quality" | "speed";

export type ImagineGenerationSettings = {
  aspectRatio: FreepikAspectRatio;
  resolution: FreepikResolution;
  structureStrength: number;
  adherence: number;
  hdr: number;
  creativeDetailing: number;
  engine: FreepikEngine;
  fixedGeneration: boolean;
  filterNsfw: boolean;
  autoEnhancePrompt: boolean;
};

export const DEFAULT_IMAGINE_GENERATION_SETTINGS: ImagineGenerationSettings = {
  aspectRatio: "square_1_1",
  resolution: "2k",
  structureStrength: 30,
  adherence: 40,
  hdr: 30,
  creativeDetailing: 40,
  engine: "automatic",
  fixedGeneration: false,
  filterNsfw: true,
  autoEnhancePrompt: true,
};

export type ImageProviderConfig = {
  id: ImageProvider;
  name: string;
  description: string;
  models: { id: string; name: string }[];
  requiresApiKey: boolean;
};

export const IMAGE_PROVIDERS: ImageProviderConfig[] = [
  {
    id: "dalam",
    name: "Dalam Image Engine",
    description: "Built-in generation powered by Dalam gateway (no API key required)",
    models: [
      { id: "google/gemini-2.5-flash-image", name: "Dalam Fast Image" },
      { id: "google/gemini-3-pro-image-preview", name: "Dalam Pro Image" },
    ],
    requiresApiKey: false,
  },
  {
    id: "freepik",
    name: "Freepik Mystic",
    description: "Fine-grained control for cinematic, realistic, and stylized outputs",
    models: [
      { id: "realism", name: "Realism" },
      { id: "anime", name: "Anime" },
      { id: "general", name: "General" },
    ],
    requiresApiKey: true,
  },
  {
    id: "openai",
    name: "OpenAI DALL·E",
    description: "High-quality image generation by OpenAI",
    models: [
      { id: "dall-e-3", name: "DALL·E 3" },
      { id: "dall-e-2", name: "DALL·E 2" },
    ],
    requiresApiKey: true,
  },
  {
    id: "stability",
    name: "Stability AI",
    description: "Stable Diffusion models for creative imagery",
    models: [
      { id: "stable-diffusion-xl-1024-v1-0", name: "SDXL 1.0" },
      { id: "stable-image-core", name: "Stable Image Core" },
    ],
    requiresApiKey: true,
  },
  {
    id: "replicate",
    name: "Replicate",
    description: "Run open-source models via Replicate",
    models: [
      { id: "black-forest-labs/flux-schnell", name: "FLUX Schnell" },
      { id: "black-forest-labs/flux-dev", name: "FLUX Dev" },
    ],
    requiresApiKey: true,
  },
];

const STORAGE_KEY = "dalam-image-provider-settings";

function isImageProvider(value: unknown): value is ImageProvider {
  return value === "dalam" || value === "freepik" || value === "openai" || value === "stability" || value === "replicate";
}

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function isFreepikAspectRatio(value: unknown): value is FreepikAspectRatio {
  return (
    value === "square_1_1" ||
    value === "portrait_2_3" ||
    value === "portrait_3_4" ||
    value === "landscape_3_2" ||
    value === "landscape_4_3" ||
    value === "widescreen_16_9"
  );
}

function isFreepikResolution(value: unknown): value is FreepikResolution {
  return value === "1k" || value === "2k";
}

function isFreepikEngine(value: unknown): value is FreepikEngine {
  return value === "automatic" || value === "quality" || value === "speed";
}

function normalizeGenerationSettings(raw: unknown): ImagineGenerationSettings {
  const parsed = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    aspectRatio: isFreepikAspectRatio(parsed.aspectRatio)
      ? parsed.aspectRatio
      : DEFAULT_IMAGINE_GENERATION_SETTINGS.aspectRatio,
    resolution: isFreepikResolution(parsed.resolution)
      ? parsed.resolution
      : DEFAULT_IMAGINE_GENERATION_SETTINGS.resolution,
    structureStrength: clampPercent(parsed.structureStrength, DEFAULT_IMAGINE_GENERATION_SETTINGS.structureStrength),
    adherence: clampPercent(parsed.adherence, DEFAULT_IMAGINE_GENERATION_SETTINGS.adherence),
    hdr: clampPercent(parsed.hdr, DEFAULT_IMAGINE_GENERATION_SETTINGS.hdr),
    creativeDetailing: clampPercent(parsed.creativeDetailing, DEFAULT_IMAGINE_GENERATION_SETTINGS.creativeDetailing),
    engine: isFreepikEngine(parsed.engine) ? parsed.engine : DEFAULT_IMAGINE_GENERATION_SETTINGS.engine,
    fixedGeneration:
      typeof parsed.fixedGeneration === "boolean"
        ? parsed.fixedGeneration
        : DEFAULT_IMAGINE_GENERATION_SETTINGS.fixedGeneration,
    filterNsfw:
      typeof parsed.filterNsfw === "boolean"
        ? parsed.filterNsfw
        : DEFAULT_IMAGINE_GENERATION_SETTINGS.filterNsfw,
    autoEnhancePrompt:
      typeof parsed.autoEnhancePrompt === "boolean"
        ? parsed.autoEnhancePrompt
        : DEFAULT_IMAGINE_GENERATION_SETTINGS.autoEnhancePrompt,
  };
}

export type ImageProviderSettings = {
  activeProvider: ImageProvider;
  activeModel: string;
  apiKeys: Partial<Record<ImageProvider, string>>;
  generation: ImagineGenerationSettings;
};

export function loadImageSettings(): ImageProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        activeProvider?: string;
        activeModel?: string;
        apiKeys?: Partial<Record<string, string>>;
        generation?: unknown;
      };

      const parsedProvider = typeof parsed.activeProvider === "string" ? parsed.activeProvider.trim().toLowerCase() : "";
      const normalizedProvider = parsedProvider === "lovable" ? "dalam" : parsedProvider;
      const activeProvider: ImageProvider = isImageProvider(normalizedProvider)
        ? normalizedProvider
        : "dalam";

      const apiKeys = {
        ...parsed.apiKeys,
      } as Partial<Record<ImageProvider, string>>;

      if (!apiKeys.dalam && parsed.apiKeys?.lovable) {
        apiKeys.dalam = parsed.apiKeys.lovable;
      }

      const provider = IMAGE_PROVIDERS.find((p) => p.id === activeProvider) || IMAGE_PROVIDERS[0];
      const requestedModel = typeof parsed.activeModel === "string" ? parsed.activeModel : "";
      const activeModel = provider.models.some((m) => m.id === requestedModel)
        ? requestedModel
        : provider.models[0].id;

      return {
        activeProvider: provider.id,
        activeModel,
        apiKeys,
        generation: normalizeGenerationSettings(parsed.generation),
      };
    }
  } catch (err) {
    console.error("Failed to load image settings:", err);
  }
  return {
    activeProvider: "dalam",
    activeModel: "google/gemini-2.5-flash-image",
    apiKeys: {},
    generation: DEFAULT_IMAGINE_GENERATION_SETTINGS,
  };
}

export function saveImageSettings(settings: ImageProviderSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getProviderConfig(id: ImageProvider): ImageProviderConfig {
  return IMAGE_PROVIDERS.find((p) => p.id === id)!;
}

export function getImageProviderLabel(provider: string): string {
  if (provider === "dalam" || provider === "lovable") return "Dalam";
  const config = IMAGE_PROVIDERS.find((p) => p.id === provider);
  return config?.name || provider;
}

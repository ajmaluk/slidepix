export type ImageProvider = "dalam" | "openai" | "stability" | "replicate";

export type ImageAspectRatio =
  | "square_1_1"
  | "portrait_2_3"
  | "portrait_3_4"
  | "landscape_3_2"
  | "landscape_4_3"
  | "widescreen_16_9";

export type ImageResolution = "1k" | "2k";
export type ImageEngine = "automatic" | "quality" | "speed";

export type ImagineGenerationSettings = {
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  structureStrength: number;
  adherence: number;
  hdr: number;
  creativeDetailing: number;
  engine: ImageEngine;
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
  return value === "dalam" || value === "openai" || value === "stability" || value === "replicate";
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
        generation: DEFAULT_IMAGINE_GENERATION_SETTINGS,
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

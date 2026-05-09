import type { FreepikAspectRatio, FreepikEngine, FreepikResolution, ImagineGenerationSettings } from "@/lib/imageSettings";

export const ASPECT_RATIO_LABELS: Record<FreepikAspectRatio, string> = {
  square_1_1: "Square 1:1",
  portrait_2_3: "Portrait 2:3",
  portrait_3_4: "Portrait 3:4",
  landscape_3_2: "Landscape 3:2",
  landscape_4_3: "Landscape 4:3",
  widescreen_16_9: "Widescreen 16:9",
};

export const RESOLUTION_LABELS: Record<FreepikResolution, string> = {
  "1k": "1K",
  "2k": "2K",
};

export const ENGINE_LABELS: Record<FreepikEngine, string> = {
  automatic: "Automatic",
  quality: "Quality",
  speed: "Speed",
};

export function buildDetailedImaginePrompt(userPrompt: string, generation: ImagineGenerationSettings): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return "";
  void generation;
  return trimmed;
}

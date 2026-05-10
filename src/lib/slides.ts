import axios from 'axios';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export type SlideLayout = 'title' | 'standard' | 'split' | 'image' | 'feature';

export interface SlideAttribution {
  name: string;
  url: string;
  downloadLocation: string;
}

export interface Slide {
  id: string;
  title: string;
  content: string[];
  imageUrl?: string;
  imageQuery?: string;
  layout: SlideLayout;
  notes?: string;
  strategy?: string;
  unsplashData?: SlideAttribution;
}

export type SlideStyle = 'freestyle' | 'academic' | 'minimal' | 'professional' | 'botanical' | 'wabisabi' | 'memphis' | 'constructivism';

export interface StylePreset {
  id: SlideStyle;
  name: string;
  description: string;
  gradient: string;
}

export interface StyleGuide extends StylePreset {
  prompt: string;
}

const STYLE_ORDER: SlideStyle[] = [
  'freestyle',
  'academic',
  'minimal',
  'professional',
  'botanical',
  'wabisabi',
  'memphis',
  'constructivism',
];

export const STYLE_LIBRARY: Record<SlideStyle, StyleGuide> = {
  freestyle: {
    id: 'freestyle',
    name: 'Freeform',
    description: 'Loose, energetic, editorial',
    gradient: 'from-orange-200 via-rose-200 to-pink-300',
    prompt: 'Use expressive layouts, dynamic pacing, punchy section breaks, and a modern editorial feel. Allow asymmetry and motion-friendly compositions, but keep the deck coherent and easy to scan.',
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    description: 'Structured, citation-friendly, precise',
    gradient: 'from-blue-50 via-indigo-50 to-slate-100',
    prompt: 'Use a rigorous, structured composition with clear hierarchy, restrained color, and strong logical sequencing. Favor charts, labeled sections, and formal readability.',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Quiet, airy, monochrome',
    gradient: 'from-slate-50 via-zinc-50 to-slate-100',
    prompt: 'Use generous whitespace, restrained typography, clean grids, and minimal ornamentation. Keep each slide focused on one idea with subtle accents and calm visual rhythm.',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Executive, high-contrast, polished',
    gradient: 'from-slate-800 via-slate-900 to-black',
    prompt: 'Use a premium executive presentation style with confident contrast, sharp typography, and refined layout discipline. Prioritize clarity, authority, and polished visual balance.',
  },
  botanical: {
    id: 'botanical',
    name: 'Botanical',
    description: 'Organic, soft, natural',
    gradient: 'from-green-50 via-emerald-50 to-teal-100',
    prompt: 'Use soft natural tones, organic shapes, subtle gradients, and calm breathing room. Keep the aesthetic tactile and grounded, with gentle curvature and a serene palette.',
  },
  wabisabi: {
    id: 'wabisabi',
    name: 'Wabi-Sabi',
    description: 'Imperfect, tactile, calm',
    gradient: 'from-stone-100 via-amber-50 to-zinc-100',
    prompt: 'Use imperfect texture, humble composition, and quiet negative space. Favor understated visuals, warm neutrals, and a handcrafted feel without visual clutter.',
  },
  memphis: {
    id: 'memphis',
    name: 'Memphis',
    description: 'Playful, geometric, bold',
    gradient: 'from-pink-100 via-yellow-100 to-cyan-100',
    prompt: 'Use playful geometry, energetic shapes, bright accents, and a youthful editorial layout. Keep the deck fun but still legible, structured, and presentation-ready.',
  },
  constructivism: {
    id: 'constructivism',
    name: 'Constructivist',
    description: 'Poster-like, angular, assertive',
    gradient: 'from-red-600 via-red-700 to-black',
    prompt: 'Use bold diagonals, strong typographic blocks, hard contrast, and poster-like composition. Make the deck feel assertive, graphic, and visually commanding.',
  },
};

export const STYLE_PRESETS: StylePreset[] = STYLE_ORDER.map((id) => {
  const { prompt: _prompt, ...preset } = STYLE_LIBRARY[id];
  return preset;
});

export function getStyleGuide(style: SlideStyle): StyleGuide {
  return STYLE_LIBRARY[style] ?? STYLE_LIBRARY.professional;
}

export function buildStyleGuidance(style: SlideStyle): string {
  const guide = getStyleGuide(style);
  return [
    `STYLE DIRECTION: ${guide.name}`,
    `Visual tone: ${guide.description}.`,
    `Design guidance: ${guide.prompt}`,
    "Keep the final deck coherent, premium, and presentation-ready.",
  ].join("\n");
}

export interface AnalysisSummary {
  topic: string;
  language: string;
  scope: string;
  audience: string;
  pageCount: number;
}

export interface Presentation {
  id: string;
  title: string;
  style: SlideStyle;
  analysis?: AnalysisSummary;
  slides: Slide[];
  createdAt: string;
}

const UNSPLASH_ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;

export interface StockImageResponse {
  url: string;
  attribution?: SlideAttribution;
}

export async function fetchStockImage(query: string): Promise<StockImageResponse | undefined> {
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      return {
        url: `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80&auto=format&fit=crop`
      };
    }

    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: {
        query,
        per_page: 1,
        orientation: 'landscape',
      },
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });

    const photo = response.data.results[0];
    if (!photo) return undefined;

    return {
      url: photo.urls.regular,
      attribution: {
        name: photo.user.name,
        url: `${photo.user.links.html}?utm_source=SlidePix&utm_medium=referral`,
        downloadLocation: photo.links.download_location
      }
    };
  } catch (error) {
    console.error('Failed to fetch image from Unsplash:', error);
    return undefined;
  }
}

/**
 * Trigger the Unsplash download endpoint.
 * Mandatory for production API approval.
 */
export async function trackUnsplashDownload(downloadLocation: string) {
  if (!UNSPLASH_ACCESS_KEY || !downloadLocation) return;
  try {
    await axios.get(downloadLocation, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });
  } catch (error) {
    console.error('Failed to track Unsplash download:', error);
  }
}

export async function exportPresentationToPdf(presentation: Presentation, slideElements: HTMLElement[]) {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1280, 720]
  });

  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await html2canvas(slideElements[i], {
      scale: 2,
      useCORS: true,
      logging: false
    });
    
    if (i > 0) pdf.addPage([1280, 720], 'landscape');
    
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, 1280, 720);
  }

  pdf.save(`${presentation.title.replace(/\s+/g, '_')}.pdf`);
}

export async function exportPresentationToPptx(presentation: Presentation) {
  const response = await fetch("/api/export/pptx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(presentation),
  });

  if (!response.ok) {
    throw new Error(`PPTX export failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${presentation.title.replace(/\s+/g, "_")}.pptx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const SLIDE_ANALYSIS_PROMPT = `
You are an expert Content Architect. Your task is to analyze a user's presentation request and provide a high-level summary.
The summary MUST include:
1. Topic: A clear subject line.
2. Language: The language of the presentation.
3. Content Scope: A brief description of what will be covered.
4. Audience: Who this is for.
5. Page Count: Recommended count (7-12).

Respond in valid JSON format ONLY. Do not include any text before or after the JSON block.
{
  "topic": "...",
  "language": "...",
  "scope": "...",
  "audience": "...",
  "pageCount": 10
}
`;

export const SLIDE_OUTLINE_PROMPT = `
You are an expert Narrative Designer. Based on the analysis, create a slide-by-slide title outline.
Respond in valid JSON format ONLY. Do not include any text before or after the JSON block.
{
  "titles": ["Title 1", "Title 2", ...]
}
`;

export const SLIDE_AGENT_SYSTEM_PROMPT = `
You are a world-class Executive Presentation Architect. 
Your goal is to transform abstract user concepts into high-stakes, intellectually rigorous, and visually stunning presentations.

CORE DIRECTIVES:
1. **Style Alignment**: Adhere strictly to the requested visual style (Minimal, Professional, etc.).
2. **Scope**: Generate a comprehensive deck of 7-12 slides.
3. **Intellectual Depth**: Use sophisticated terminology and structured logic.
4. **Content Richness**: Each 'content' array MUST contain 4-6 detailed bullet points.
5. **Detailed Speaker Notes**: Provide 3+ paragraphs of script per slide.

OUTPUT SCHEMA:
{
  "title": "...",
  "slides": [
    {
      "id": "string",
      "title": "...",
      "content": ["...", "...", "..."],
      "imageQuery": "...",
      "layout": "title | standard | split | image | feature",
      "notes": "...",
      "strategy": "..."
    }
  ]

Layout Guidelines:
- 'title': High-impact opening or section break. Focus on the central theme.
- 'standard': Deep-dive list for data or multi-point analysis.
- 'split': Comparing dualities or illustrating a concept with a corresponding visual.
- 'image': Full-bleed visual to evoke emotion or set a thematic tone.
- 'feature': Highlighting 1-3 critical pillars or core metrics.

Language Style: Professional, visionary, and authoritative.
`;

export function extractJson<T>(text: string): T | null {
  try {
    // 1. Basic cleanup: strip markdown code blocks if they exist
    const cleanStr = text.replace(/```json|```/gi, '').trim();

    // 2. Find the bounds of the JSON object or array
    const objStart = cleanStr.indexOf('{');
    const objEnd = cleanStr.lastIndexOf('}');
    const arrStart = cleanStr.indexOf('[');
    const arrEnd = cleanStr.lastIndexOf(']');
    
    let startIdx = -1;
    let endIdx = -1;
    
    if (objStart !== -1 && objEnd !== -1 && (arrStart === -1 || objStart < arrStart)) {
      startIdx = objStart;
      endIdx = objEnd;
    } else if (arrStart !== -1 && arrEnd !== -1) {
      startIdx = arrStart;
      endIdx = arrEnd;
    } else if (objStart !== -1 && objEnd !== -1) {
      startIdx = objStart;
      endIdx = objEnd;
    }

    if (startIdx === -1 || endIdx === -1) return null;

    return JSON.parse(cleanStr.substring(startIdx, endIdx + 1));
  } catch (e) {
    console.error("Failed to extract JSON from string:", e);
    return null;
  }
}

export function parsePresentation(jsonString: string, defaultStyle: SlideStyle = 'professional'): Presentation | null {
  const parsed = extractJson<any>(jsonString);
  if (!parsed) return null;

  return {
    id: crypto.randomUUID(),
    title: parsed.title || "Untitled Presentation",
    style: parsed.style || defaultStyle,
    slides: (parsed.slides || []).map((s: any) => ({
      ...s,
      id: s.id || Math.random().toString(36).substring(7),
      layout: s.layout || 'standard',
      content: Array.isArray(s.content) ? s.content : [s.content].filter(Boolean)
    })),
    createdAt: new Date().toISOString()
  };
}

/**
 * Dalam AI Routing & Multi-Provider System
 * 
 * This module acts as the central hub for all AI interactions, including:
 * 1. Chat Streaming (via Groq, OpenRouter, Gemini, NVIDIA, GitHub, Pico)
 * 2. Web Search (via Wikipedia, DuckDuckGo, Gemini/Pico)
 * 3. Image Generation
 * 4. OCR Structuring
 * 
 * Features robust key rotation, automatic failover queues, and tiered access logic.
 */

import { GoogleGenAI } from '@google/genai';
import { Groq } from 'groq-sdk';
import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import axios from 'axios';
import { getEnv, isDev } from "./env";
import { resolveEdgeFunctionsBaseUrl } from "@/lib/apiConfig";
import { getApiKeyRotator } from "@/lib/apiKeyRotation";
import { 
  getUserSubscription, 
  trackProUsage, 
  trackVoiceUsage,
  getEffectiveFeatures 
} from "@/lib/subscription";

// ─── Environment Parsing ───

/**
 * Splits a comma-separated environment string into an array of keys.
 */
const splitKeys = (envStr?: string) => (envStr || "").split(',').map(s => s.trim()).filter(Boolean);

const GITHUB_TOKEN = getEnv("VITE_GITHUB_TOKEN");
// eslint-disable-next-line unused-imports/no-unused-vars
const GROQ_KEYS = splitKeys(getEnv("VITE_GROQ_API_KEYS"));
const OPENROUTER_KEYS = splitKeys(getEnv("VITE_OPENROUTER_API_KEYS"));
// eslint-disable-next-line unused-imports/no-unused-vars
const GEMINI_KEYS = splitKeys(getEnv("VITE_GEMINI_API_KEYS"));
// eslint-disable-next-line unused-imports/no-unused-vars
const NVIDIA_KEYS = splitKeys(getEnv("VITE_NVIDIA_API_KEYS"));
const DALAM_TEXT_API = getEnv("VITE_DALAM_TEXT_API") || getEnv("VITE_PICO_TEXT_API");
const FREEPIK_API_KEY = getEnv("VITE_FREEPIK_API_KEY");
const FREEPIK_API_BASE = "https://api.freepik.com/v1/ai/mystic";
const FREEPIK_PROXY_BASE = "/api/freepik-mystic";
const FREEPIK_REMOVE_BG_API = "https://api.freepik.com/v1/ai/remove-background";
const FREEPIK_REMOVE_BG_PROXY = "/api/freepik-remove-bg";


// ─── Key Rotation State ───
// Leverages ApiKeyRotator for failure-aware round-robin rotation with cooldown.
const rotator = getApiKeyRotator();

/**
 * Gets the next available key for a provider via the resilient rotator.
 * Falls back to legacy index-based rotation if the rotator has no keys registered.
 */
function getRotatedKey(provider: "groq" | "gemini" | "nvidia" | "openrouter"): string | null {
  return rotator.getKey(provider);
}

/**
 * @deprecated Use getRotatedKey instead. Kept for providers not yet in the rotator.
 */
const currentKeys = {
  groqIndex: 0,
  openRouterIndex: 0,
  geminiIndex: 0,
  nvidiaIndex: 0,
};

function getNextKey(array: string[], indexKey: keyof typeof currentKeys): string | null {
  if (!array.length) return null;
  const key = array[currentKeys[indexKey]];
  currentKeys[indexKey] = (currentKeys[indexKey] + 1) % array.length;
  return key;
}

// ─── Types ───

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessage = { role: ChatRole; content: string };
export type StreamCallback = (chunk: string) => void;
export type FallbackProvider = "pico" | "groq" | "openrouter" | "gemini" | "nvidia" | "github" | "openai" | "anthropic" | "mistral";

/**
 * Configuration options for chat routing.
 */
export interface RouterOptions {
  messages: ChatMessage[];
  tier: "free" | "basic" | "pro" | "enterprise";
  onChunk: StreamCallback;
  forcedProvider?: FallbackProvider | "lovable" | "dalam" | string;
  selectedModel?: string;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  searchResults?: { title: string; url: string; snippet: string }[];
  rotationPasses?: number;
  providerAttemptTimeoutMs?: number;
  userId?: string;
  isVoice?: boolean;
}

/**
 * Configuration for image generation requests.
 */
export interface ImageGenOptions {
  prompt: string;
  provider: string;
  model?: string;
  apiKey?: string;
  aspectRatio?: "square_1_1" | "portrait_2_3" | "portrait_3_4" | "landscape_3_2" | "landscape_4_3" | "widescreen_16_9";
  resolution?: "1k" | "2k";
  structureStrength?: number;
  adherence?: number;
  hdr?: number;
  creativeDetailing?: number;
  engine?: "automatic" | "quality" | "speed";
  fixedGeneration?: boolean;
  filterNsfw?: boolean;
  signal?: AbortSignal;
}

/**
 * Configuration for OCR data structuring.
 */
export interface OCROptions {
  text: string;
  signal?: AbortSignal;
}

/**
 * Configuration for web search requests.
 */
export interface SearchOptions {
  query: string;
  signal?: AbortSignal;
}

type LiveMarketResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAtMs?: number;
};

type QueueProvider = FallbackProvider | "edge";

const DEFAULT_PROVIDER_ROTATION_PASSES = 2;
const MAX_PROVIDER_ROTATION_PASSES = 6;
const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 25_000;
const MIN_PROVIDER_ATTEMPT_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_ATTEMPT_TIMEOUT_MS = 90_000;

function parsePositiveInt(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const envRotationPasses = parsePositiveInt(getEnv("VITE_PROVIDER_ROTATION_PASSES"));
const envProviderAttemptTimeout = parsePositiveInt(getEnv("VITE_PROVIDER_ATTEMPT_TIMEOUT_MS"));

/**
 * Sanitizes AI response content by removing common prefixes like "Response:"
 */
function sanitizeResponseContent(content: string): string {
  if (!content) return content;
  
  // We only want to sanitize the START of a response (like "Response:").
  // But since this is called on every chunk during streaming, we should NOT trim()
  // as that would remove essential spaces and break word boundaries.
  
  let sanitized = content;
  
  const prefixes = [
    "Response:",
    "response:",
    "RESPONSE:",
  ];
  
  const lower = sanitized.toLowerCase();
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      sanitized = sanitized.substring(prefix.length);
      // Remove up to one leading space if it exists after the prefix
      if (sanitized.startsWith(" ")) {
        sanitized = sanitized.substring(1);
      }
      break;
    }
  }
  
  return sanitized;
}

function toErrorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isAbortError(error: unknown): boolean {
  const text = toErrorText(error);
  return /AbortError|The operation was aborted|aborted/i.test(text);
}

function shouldFallbackToClientSearch(error: unknown, status?: number): boolean {
  if (status === 404 || (typeof status === "number" && status >= 500)) {
    return true;
  }

  const message = toErrorText(error);
  return /ECONNREFUSED|fetch failed|Failed to fetch|NetworkError|TypeError: Failed to fetch/i.test(message);
}

type SseBufferResult = {
  buffer: string;
  lines: string[];
};

function appendSseLines(buffer: string, chunk: string, final = false): SseBufferResult {
  let nextBuffer = buffer + chunk;
  const lines: string[] = [];

  while (true) {
    const boundary = nextBuffer.indexOf("\n");
    if (boundary === -1) break;

    lines.push(nextBuffer.slice(0, boundary).replace(/\r$/, ""));
    nextBuffer = nextBuffer.slice(boundary + 1);
  }

  if (final && nextBuffer.length > 0) {
    lines.push(nextBuffer.replace(/\r$/, ""));
    nextBuffer = "";
  }

  return { buffer: nextBuffer, lines };
}

function extractSseDataLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const dataStr = trimmed.slice(5).trimStart();
  if (!dataStr || dataStr === "[DONE]") return null;
  return dataStr;
}

/**
 * Maps branded model names to specific provider models.
 */
function resolveBackendModel(brandedModel: string | undefined, provider: QueueProvider): string {
  if (provider === "nvidia") return "nvidia/nvidia-nemotron-nano-9b-v2";
  if (provider === "gemini") return "gemini-3-flash-preview";
  if (provider === "groq") return "llama-3.3-70b-versatile";
  if (provider === "github") return "meta/Meta-Llama-3.1-8B-Instruct";
  if (provider === "openrouter") return "google/gemini-2.5-flash-lite";
  return brandedModel || "";
}

function isRealtimeQuery(query: string): boolean {
  return /\b(latest|current|today|now|live|news|update|breaking|market|price|trend|recent)\b/i.test(query);
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[|\]\]>/g, "");
}

function parseGoogleNewsRss(xml: string): LiveMarketResult[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const results: LiveMarketResult[] = [];

  for (const item of items.slice(0, 6)) {
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    if (!titleMatch || !linkMatch) continue;

    const title = decodeXmlEntities(titleMatch[1]).replace(/\s+-\s+[^-]+$/, "").trim();
    const url = decodeXmlEntities(linkMatch[1]).trim();
    const snippet = decodeXmlEntities((descMatch?.[1] || "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);

    const publishedAtMs = pubDateMatch ? Date.parse(decodeXmlEntities(pubDateMatch[1]).trim()) : NaN;

    if (!title || !url) continue;
    results.push({
      title,
      url,
      snippet: snippet || "Latest report from Google News RSS.",
      publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : undefined,
    });
  }

  return results;
}

async function fetchRealtimeNews(query: string, signal?: AbortSignal): Promise<LiveMarketResult[]> {
  if (!isRealtimeQuery(query)) return [];

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`;
    
    const resp = await axios.get(proxyUrl, {
      signal,
      timeout: 5000,
      responseType: "text",
    });

    return parseGoogleNewsRss(String(resp.data || ""));
  } catch {
    return [];
  }
}

function parseStooqClose(csv: string): { close: number; date: string; symbol: string } | null {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;
  const values = lines[1].split(",").map((v) => v.trim());
  if (values.length < 7) return null;

  const symbol = values[0];
  const date = values[2];
  const close = Number(values[6]);
  if (!Number.isFinite(close) || close <= 0) return null;

  return { close, date, symbol };
}

async function fetchStooqQuote(symbol: string, label: string, signal?: AbortSignal): Promise<LiveMarketResult | null> {
  try {
    const stooqUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&i=d`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(stooqUrl)}`;
    
    const resp = await axios.get(proxyUrl, {
      signal,
      timeout: 5000,
      responseType: "text"
    });

    const parsed = parseStooqClose(String(resp.data || ""));
    if (!parsed) return null;

    return {
      title: `${label} live quote`,
      url: `https://stooq.com/q/?s=${encodeURIComponent(symbol)}`,
      snippet: `${label}: ${parsed.close.toFixed(2)} USD (close: ${parsed.date}, source: Stooq)`
    };
  } catch {
    return null;
  }
}

async function fetchCryptoQuote(coinId: "bitcoin" | "ethereum", signal?: AbortSignal): Promise<LiveMarketResult | null> {
  try {
    const resp = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
      signal,
      timeout: 5000,
      params: {
        ids: coinId,
        vs_currencies: "usd",
        include_last_updated_at: true,
      },
    });

    const coinData = resp.data?.[coinId];
    if (!coinData || typeof coinData.usd !== "number") return null;

    const updatedAt = coinData.last_updated_at
      ? new Date(Number(coinData.last_updated_at) * 1000).toISOString()
      : "unknown";

    const label = coinId === "bitcoin" ? "Bitcoin" : "Ethereum";
    return {
      title: `${label} live quote`,
      url: `https://www.coingecko.com/en/coins/${coinId}`,
      snippet: `${label}: ${Number(coinData.usd).toFixed(2)} USD (updated: ${updatedAt}, source: CoinGecko)`
    };
  } catch {
    return null;
  }
}

async function fetchLiveMarketSnapshot(query: string, signal?: AbortSignal): Promise<LiveMarketResult | null> {
  const q = query.toLowerCase();

  if (/\b(gold|xau|xauusd|bullion|prize of gold|price of gold|gold price)\b/.test(q)) {
    return fetchStooqQuote("xauusd", "Gold", signal);
  }

  if (/\b(silver|xag|xagusd|silver price)\b/.test(q)) {
    return fetchStooqQuote("xagusd", "Silver", signal);
  }

  if (/\b(wti|crude oil|oil price)\b/.test(q)) {
    return fetchStooqQuote("cl.f", "WTI crude oil", signal);
  }

  if (/\b(brent)\b/.test(q)) {
    return fetchStooqQuote("cb.f", "Brent crude oil", signal);
  }

  if (/\b(bitcoin|btc|btcusd|bitcoin price)\b/.test(q)) {
    return fetchCryptoQuote("bitcoin", signal);
  }

  if (/\b(ethereum|eth|ethusd|ethereum price)\b/.test(q)) {
    return fetchCryptoQuote("ethereum", signal);
  }

  return null;
}

/**
 * Performs a multi-source web search and synthesizes a summary.
 * Prioritizes high-quality free sources like Wikipedia and DuckDuckGo,
 * with AI-driven research as a fallback/enhancement.
 */
export async function runWebSearch(options: SearchOptions): Promise<{
  results: { title: string; url: string; snippet: string }[];
  summary: string | null;
}> {
  const searchResults: { title: string; url: string; snippet: string }[] = [];
  const seenUrls = new Set<string>();
  const freshnessByUrl = new Map<string, number>();
  let summary: string | null = null;

  const addResult = (title: string, url: string, snippet: string, freshnessScore?: number) => {
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      searchResults.push({ title, url, snippet });
      if (typeof freshnessScore === "number") freshnessByUrl.set(url, freshnessScore);
    }
  };

  // 0. Prefer server-side search when deployed on Cloudflare Pages.
  // If the endpoint is missing during local dev, we fall back to client-side sources below.
  try {
    const resp = await fetch("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: options.query, maxResults: 6 }),
      signal: options.signal,
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const r of results) {
        if (typeof r?.url !== "string" || typeof r?.snippet !== "string") continue;
        const title = typeof r?.title === "string" && r.title.trim() ? r.title.trim() : new URL(r.url).hostname;
        addResult(title, r.url, r.snippet, 0.6);
      }
      summary = typeof data?.summary === "string" ? data.summary : null;
    } else if (resp.status === 404 || resp.status >= 500) {
      if (isDev()) {
        console.warn("Server-side web search unavailable, falling back to client-side search:", resp.status);
      }
    }
  } catch (e) {
    if (isAbortError(e) || options.signal?.aborted) throw e;

    const shouldFallback = shouldFallbackToClientSearch(e);
    if (shouldFallback) {
      if (isDev()) {
        console.warn("Server-side web search unavailable, falling back to client-side search:", toErrorText(e));
      }
    } else {
      console.warn("Server-side web search failed:", e);
    }
  }


  // 0. Try a dedicated live market quote first for finance/commodity prompts.
  const liveMarket = await fetchLiveMarketSnapshot(options.query, options.signal);
  if (liveMarket) {
    addResult(liveMarket.title, liveMarket.url, liveMarket.snippet, 1.0);
    summary = liveMarket.snippet;
  }

  // 0.5. Add latest headlines for real-time prompts.
  const realtimeNews = await fetchRealtimeNews(options.query, options.signal);
  for (const item of realtimeNews) {
    const freshness = item.publishedAtMs
      ? Math.max(0.2, 1 - ((Date.now() - item.publishedAtMs) / (1000 * 60 * 60 * 24 * 5)))
      : 0.65;
    addResult(item.title, item.url, item.snippet, freshness);
  }

  // 1. Wikipedia Search (Free & High Quality) - client fallback if server did not return enough.
  if (searchResults.length < 3) {
    try {
      const wikiResp = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(options.query)}&format=json&origin=*`, { signal: options.signal, timeout: 5000 });
      if (wikiResp.data?.query?.search) {
        // Filter irrelevant Wikipedia results by ensuring the title or snippet shares words with the query
        const queryWords = options.query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        wikiResp.data.query.search.slice(0, 5).forEach((item: any) => {
          const titleLower = item.title.toLowerCase();
          const snippetLower = item.snippet.toLowerCase();
          const isRelevant = queryWords.length === 0 || queryWords.some(w => titleLower.includes(w) || snippetLower.includes(w));
          
          if (isRelevant) {
            const snippet = item.snippet
              .replace(/<\/?[^>]+(>|$)/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            addResult(
              item.title,
              `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
              snippet || "Relevant Wikipedia result."
            );
          }
        });
      }
    } catch (e) {
      console.warn("Wikipedia search failed:", e);
    }
  }

  // 2. Client fallback: SearXNG Public API (Free & JSON format)
  if (searchResults.length < 3) {
    try {
      const searxUrl = `https://searx.be/search?q=${encodeURIComponent(options.query)}&format=json`;
      
      const fetchController = new AbortController();
      const timeoutId = setTimeout(() => fetchController.abort(), 5000);
      
      if (options.signal) {
        options.signal.addEventListener('abort', () => fetchController.abort());
      }
      
      try {
        const resp = await fetch(searxUrl, { signal: fetchController.signal }).then(r => r.json());

        let count = 0;
        if (resp.results) {
          for (const res of resp.results) {
            if (count >= 3) break;
            const snippet = String(res.content || res.snippet || "")
              .replace(/<\/?[^>]+(>|$)/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (res.url && snippet) {
              addResult(res.title || new URL(res.url).hostname, res.url, snippet, 0.6);
              count++;
            }
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (e) {
      console.warn("SearXNG search failed:", e);
    }
  }

  // Summary generation is intentionally handled by the main chat model to avoid exposing API keys client-side.

  // Final Ranking: Wikipedia first, then others
  const rankedResults = searchResults.sort((a, b) => {
    const freshnessA = freshnessByUrl.get(a.url) ?? 0.35;
    const freshnessB = freshnessByUrl.get(b.url) ?? 0.35;
    if (Math.abs(freshnessA - freshnessB) > 0.12) return freshnessB - freshnessA;

    const isLiveA = /stooq\.com|coingecko\.com/i.test(a.url);
    const isLiveB = /stooq\.com|coingecko\.com/i.test(b.url);
    if (isLiveA && !isLiveB) return -1;
    if (!isLiveA && isLiveB) return 1;

    const isNewsA = /news\.google\.com/i.test(a.url);
    const isNewsB = /news\.google\.com/i.test(b.url);
    if (isNewsA && !isNewsB) return -1;
    if (!isNewsA && isNewsB) return 1;

    if (a.url.includes("wikipedia.org")) return -1;
    if (b.url.includes("wikipedia.org")) return 1;
    return 0;
  });

  return { results: rankedResults, summary };
}

// ─── Provider Implementations ───

/**
 * Uses the Dalam text service to analyze raw OCR text and return it in a structured JSON format.
 */
export async function runPicoOCRStructure(options: OCROptions): Promise<{ structuredData: string; metadata: string }> {
  if (!DALAM_TEXT_API) throw new Error("Dalam text API not configured");

  const prompt = `Analyze and structure the following OCR text. Return only valid JSON with fields "structuredData" (a string representation of key data points) and "metadata" (contextual information about the document type and content).
  
  OCR TEXT:
  ${options.text}`;

  const response = await axios.post(DALAM_TEXT_API, {
    prompt: prompt,
  }, { signal: options.signal });

  if (response.data && response.data.status === "success" && response.data.text) {
    try {
      const text = response.data.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { structuredData: text, metadata: "Extracted via Dalam" };
    } catch {
      return { structuredData: response.data.text, metadata: "Raw extraction" };
    }
  } else {
    throw new Error("Dalam OCR structuring failed");
  }
}

/**
 * Detects if the user query requests a long/detailed response.
 */
function detectLongResponseIntent(messages: ChatMessage[]): boolean {
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content || "";
  const q = lastUser.toLowerCase();
  return /\b(detail|explain|comprehensive|thorough|complete|full|elaborate|in-depth|step.by.step|write|essay|article|guide|tutorial|list all|everything|summary of|summarize|analyze|analysis|compare|review|describe)\b/i.test(q)
    || q.length > 150
    || (q.match(/\?/g) || []).length > 1;
}

/**
 * Builds a response-length directive to prepend to prompts.
 */
function buildLengthDirective(messages: ChatMessage[]): string {
  if (!detectLongResponseIntent(messages)) return "";
  return `\n\nIMPORTANT RESPONSE LENGTH INSTRUCTION: The user is requesting a detailed response. Provide a highly thorough, comprehensive, and expertly structured answer. Do NOT be brief. Utilize immaculate markdown formatting: include descriptive headers (##), scannable bullet points, bold text for emphasis, and properly highlighted code blocks where appropriate. Cover all aspects of the topic deeply, ensuring a world-class level of insight and clarity.\n`;
}

/**
 * Internal handler for the Dalam text generation.
 */
async function runPico(options: RouterOptions): Promise<void> {
  if (!DALAM_TEXT_API) throw new Error("Dalam text API not configured");
  
  const sysMsg = options.messages.find(m => m.role === 'system')?.content || "";
  const lengthDirective = buildLengthDirective(options.messages);
  
  // Build a rich conversation context for Dalam — include more history for better awareness
  const nonSystemMessages = options.messages.filter(m => m.role !== 'system');
  const conversationHistory = nonSystemMessages
    .slice(-16) // Keep last 16 messages for richer context
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  
  // Extract the latest user query for focused response
  const lastUserMsg = nonSystemMessages.filter(m => m.role === 'user').pop()?.content || '';
  
  const prompt = [
    sysMsg ? `System Instructions:\n${sysMsg}` : '',
    lengthDirective,
    `\nConversation History:\n${conversationHistory}`,
    `\nIMPORTANT: The user's latest question is: "${lastUserMsg}"`,
    `\nProvide a complete, well-formatted response using markdown. Do NOT truncate or cut short.`,
    `If the user asks for something detailed, provide a thorough and comprehensive answer.`,
    `If the user asks a simple question, give a clear and direct answer.`,
    `Always use appropriate markdown: ## headers, **bold**, bullet points, and \`code\` where helpful.`
  ].filter(Boolean).join('\n');
  
  if (isDev()) {
    console.log(`[Dalam Router] Requesting Dalam text API:`, {
      promptLength: prompt.length,
      historyLength: nonSystemMessages.length
    });
  }
  
  const response = await axios.post(DALAM_TEXT_API, {
    prompt: prompt,
  }, { signal: options.signal });

  if (response.data && response.data.status === "success" && response.data.text) {
    const sanitized = sanitizeResponseContent(response.data.text);
    options.onChunk(sanitized);
  } else {
    throw new Error("Dalam text API failed to return text");
  }
}

/**
 * Internal handler for Groq chat completions.
 */
async function runGroq(options: RouterOptions): Promise<void> {
  const key = options.apiKey || getRotatedKey("groq");
  if (!key) throw new Error("No Groq keys available");

  const wantsLong = detectLongResponseIntent(options.messages);
  const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
  const stream = await groq.chat.completions.create({
    messages: options.messages as any,
    model: resolveBackendModel(options.selectedModel, "groq"),
    temperature: 0.7,
    max_tokens: wantsLong ? 8192 : 4096,
    top_p: 0.9,
    stream: true,
  });

  for await (const chunk of stream) {
    if (options.signal?.aborted) break;
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      options.onChunk(content);
    }
  }
}

/**
 * Internal handler for OpenRouter chat completions.
 * Uses fetch for robust streaming.
 */
async function runOpenRouter(options: RouterOptions): Promise<void> {
  const key = options.apiKey || getRotatedKey("openrouter");
  if (!key) throw new Error("No OpenRouter keys available");

  const wantsLong = detectLongResponseIntent(options.messages);
  // Using raw fetch for streaming as SDK might have version conflicts or missing properties
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": window.location.origin,
      "X-OpenRouter-Title": "Dalam AI",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: resolveBackendModel(options.selectedModel, "openrouter"),
      messages: options.messages,
      stream: true,
      max_tokens: wantsLong ? 8192 : 4096,
      temperature: 0.7,
      top_p: 0.9,
    }),
    signal: options.signal
  });

  if (!response.ok) throw new Error(`OpenRouter HTTP error! status: ${response.status}`);
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done || options.signal?.aborted) break;
    const parsed = appendSseLines(sseBuffer, decoder.decode(value, { stream: true }));
    sseBuffer = parsed.buffer;

    for (const line of parsed.lines) {
      const dataStr = extractSseDataLine(line);
      if (!dataStr) continue;
      try {
        const data = JSON.parse(dataStr);
        const content = data.choices?.[0]?.delta?.content;
        if (content) options.onChunk(content);
      } catch {
        // Ignore malformed partial SSE frames
      }
    }
  }

  const remaining = decoder.decode();
  if (remaining) {
    sseBuffer += remaining;
  }

  const flushed = appendSseLines(sseBuffer, "", true);
  for (const line of flushed.lines) {
    const dataStr = extractSseDataLine(line);
    if (!dataStr) continue;
    try {
      const data = JSON.parse(dataStr);
      const content = data.choices?.[0]?.delta?.content;
      if (content) options.onChunk(content);
    } catch {
      // Ignore malformed partial SSE frames
    }
  }
}

/**
 * Internal handler for Google Gemini chat completions.
 */
async function runGemini(options: RouterOptions): Promise<void> {
  const key = options.apiKey || getRotatedKey("gemini");
  if (!key) throw new Error("No Gemini keys available");

  const ai = new GoogleGenAI({ apiKey: key });
  const contents = options.messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  
  const sysMsg = options.messages.find(m => m.role === 'system')?.content;

  const response = await ai.models.generateContentStream({
    model: resolveBackendModel(options.selectedModel, "gemini"),
    contents: contents as any,
    config: {
      ...(sysMsg ? { systemInstruction: sysMsg } : {}),
      temperature: 0.7,
      topP: 0.9,
    }
  });

  for await (const chunk of response) {
    if (options.signal?.aborted) break;
    if (chunk.text) {
      options.onChunk(chunk.text);
    }
  }
}

const NVIDIA_THINK_START_TAG = "<think>";
const NVIDIA_THINK_END_TAG = "</think>";

export type NvidiaThinkParserState = {
  buffer: string;
  inThinkBlock: boolean;
};

export function createNvidiaThinkParserState(): NvidiaThinkParserState {
  return {
    buffer: "",
    inThinkBlock: false,
  };
}

function getPartialTagLength(buffer: string, tag: string): number {
  const maxLength = Math.min(buffer.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (tag.startsWith(buffer.slice(buffer.length - length))) {
      return length;
    }
  }
  return 0;
}

export function consumeNvidiaThinkChunk(
  state: NvidiaThinkParserState,
  content: string
): { output: string; state: NvidiaThinkParserState } {
  let buffer = state.buffer + content;
  let inThinkBlock = state.inThinkBlock;
  let output = "";

  while (buffer.length > 0) {
    if (!inThinkBlock) {
      const startIdx = buffer.indexOf(NVIDIA_THINK_START_TAG);
      if (startIdx !== -1) {
        output += buffer.slice(0, startIdx);
        buffer = buffer.slice(startIdx + NVIDIA_THINK_START_TAG.length);
        inThinkBlock = true;
        continue;
      }

      const partialLength = getPartialTagLength(buffer, NVIDIA_THINK_START_TAG);
      if (partialLength > 0) {
        output += buffer.slice(0, buffer.length - partialLength);
        buffer = buffer.slice(buffer.length - partialLength);
      } else {
        output += buffer;
        buffer = "";
      }
      break;
    }

    const endIdx = buffer.indexOf(NVIDIA_THINK_END_TAG);
    if (endIdx !== -1) {
      buffer = buffer.slice(endIdx + NVIDIA_THINK_END_TAG.length);
      inThinkBlock = false;
      continue;
    }

    const partialLength = getPartialTagLength(buffer, NVIDIA_THINK_END_TAG);
    if (partialLength > 0) {
      buffer = buffer.slice(buffer.length - partialLength);
    } else {
      buffer = "";
    }
    break;
  }

  return {
    output,
    state: {
      buffer,
      inThinkBlock,
    },
  };
}

/**
 * Internal handler for NVIDIA chat completions.
 */
async function runNvidia(options: RouterOptions): Promise<void> {
  const key = options.apiKey || getRotatedKey("nvidia");
  if (!key) throw new Error("No Nvidia keys available");

  const wantsLong = detectLongResponseIntent(options.messages);
  const inBrowser = typeof window !== "undefined";
  const invokeUrl = inBrowser ? "/api/nvidia/v1/chat/completions" : "https://integrate.api.nvidia.com/v1/chat/completions";
  
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Accept": "text/event-stream",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: resolveBackendModel(options.selectedModel, "nvidia"),
      messages: options.messages,
      max_tokens: wantsLong ? 32768 : 16384,
      temperature: 0.60,
      top_p: 0.95,
      stream: true
    }),
    signal: options.signal
  });

  if (!response.ok) throw new Error(`Nvidia HTTP error! status: ${response.status}`);
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let sseBuffer = "";
  let thinkState = createNvidiaThinkParserState();

  while (true) {
    const { done, value } = await reader.read();
    if (done || options.signal?.aborted) break;
    const parsed = appendSseLines(sseBuffer, decoder.decode(value, { stream: true }));
    sseBuffer = parsed.buffer;

    for (const line of parsed.lines) {
      const dataStr = extractSseDataLine(line);
      if (!dataStr) continue;
      try {
        const data = JSON.parse(dataStr);
        const content = data.choices?.[0]?.delta?.content;

        if (content) {
          const parsedThink = consumeNvidiaThinkChunk(thinkState, content);
          thinkState = parsedThink.state;
          const outputText = parsedThink.output;
          if (outputText) {
            options.onChunk(outputText);
          }
        }
      } catch (e) {
        if (isDev()) console.warn("[NVIDIA] SSE parse error:", e, dataStr);
      }
    }
  }

  const remaining = decoder.decode();
  if (remaining) {
    sseBuffer += remaining;
  }

  const flushed = appendSseLines(sseBuffer, "", true);
  for (const line of flushed.lines) {
    const dataStr = extractSseDataLine(line);
    if (!dataStr) continue;
    try {
      const data = JSON.parse(dataStr);
      const content = data.choices?.[0]?.delta?.content;

      if (content) {
        const parsedThink = consumeNvidiaThinkChunk(thinkState, content);
        thinkState = parsedThink.state;
        const outputText = parsedThink.output;
        if (outputText) {
          options.onChunk(outputText);
        }
      }
    } catch (e) {
      if (isDev()) console.warn("[NVIDIA] SSE parse error:", e, dataStr);
    }
  }
}

/**
 * Internal handler for GitHub Inference chat completions.
 */
async function runGithub(options: RouterOptions): Promise<void> {
  const key = options.apiKey || GITHUB_TOKEN;
  if (!key) throw new Error("GitHub token not configured");

  const wantsLong = detectLongResponseIntent(options.messages);
  const client = ModelClient("https://models.github.ai/inference", new AzureKeyCredential(key));
  const response = await client.path("/chat/completions").post({
    body: {
      messages: options.messages,
      model: resolveBackendModel(options.selectedModel, "github"),
      temperature: 0.7,
      max_tokens: wantsLong ? 8192 : 4096,
      top_p: 0.9,
    }
  });

  if (isUnexpected(response)) {
    throw response.body?.error || new Error("GitHub Inference failed");
  }

  const content = (response.body as any).choices?.[0]?.message?.content;
  if (content) {
    const sanitized = sanitizeResponseContent(content);
    if (sanitized) options.onChunk(sanitized);
  } else {
    throw new Error("Empty response from GitHub");
  }
}

/**
 * Routes image generation requests to the best available provider.
 */
export async function routeImageGen(options: ImageGenOptions): Promise<string> {
  const provider = (options.provider || "").trim().toLowerCase();

  if (provider === "freepik") {
    const freepikKey = options.apiKey || FREEPIK_API_KEY;
    if (!freepikKey) {
      throw new Error("Freepik API key is required.");
    }

    const clampPercent = (value: number | undefined, fallback: number) => {
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) return fallback;
      return Math.min(100, Math.max(0, Math.round(normalized)));
    };

    const normalizeWeight = (value: number | undefined, fallback: number) => {
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) return fallback / 100;
      return Math.min(1.0, Math.max(0.0, normalized / 100));
    };

    const normalizeFreepikModel = (model: string | undefined) => {
      const value = (model || "").trim().toLowerCase();
      // Official Mystic variants: realism, fluid, flexible
      if (value === "realism" || value === "fluid" || value === "flexible") return value;
      // Map UI friendly names to official model variants
      if (value === "anime") return "flexible";
      if (value === "general") return "realism";
      return "realism";
    };

    // Construct the Mystic API request body
    // Reference: docs.freepik.com API Reference
    const body: any = {
      prompt: options.prompt,
      resolution: options.resolution || "2k",
      aspect_ratio: options.aspectRatio || "square_1_1",
      model: normalizeFreepikModel(options.model),
      creative_detailing: clampPercent(options.creativeDetailing, 40),
    };

    // Removed adherence and hdr as they are not top-level parameters in the official Mystic documentation
    // and were causing 400 Validation errors.
    
    // structure_strength REQUIRES a structure_reference image to be present
    // Since we don't currently support reference images in this UI, we omit it to avoid validation errors
    if (options.structureStrength !== undefined && (body.structure_reference)) {
      body.structure_strength = normalizeWeight(options.structureStrength, 30);
    }

    const tryReadUrl = (payload: any): string | null => {
      const generated = payload?.data?.generated;
      const generatedFirst = Array.isArray(generated) ? generated[0] : generated;
      const candidates = [
        generatedFirst,
        generatedFirst?.url,
        generatedFirst?.image_url,
        generatedFirst?.signed_url,
        generatedFirst?.download_url,
        payload?.data?.[0]?.url,
        payload?.data?.url,
        payload?.data?.image_url,
        payload?.image?.url,
        payload?.image_url,
        payload?.output?.[0],
        payload?.output,
        payload?.url,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    const inBrowser = typeof window !== "undefined";
    const requestBase = inBrowser ? FREEPIK_PROXY_BASE : FREEPIK_API_BASE;
    const headers = inBrowser
      ? { "Content-Type": "application/json" }
      : {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-freepik-api-key": freepikKey,
        };

    let resp: Response;
    try {
      resp = await fetch(requestBase, {
        method: "POST",
        headers: {
          ...headers,
          ...(inBrowser && options.apiKey ? { "x-freepik-api-key": options.apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (err: any) {
      const message = String(err?.message || "").toLowerCase();
      if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed") || message.includes("cors")) {
        throw new Error("Freepik request was blocked by the browser. When the app is running locally, the Vite proxy route must be enabled so browser calls can reach Freepik.");
      }
      throw err;
    }

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      if (import.meta.env.DEV) {
        console.error("[Freepik Generation Failed]", {
          status: resp.status,
          statusText: resp.statusText,
          data,
          sentBody: body,
        });
      }
      const msg = data?.message || data?.error?.message || `Freepik request failed (${resp.status})`;
      throw new Error(msg);
    }

    const activeBase = requestBase;

    const directUrl = tryReadUrl(data);
    if (directUrl) return directUrl;

    const taskId =
      (typeof data?.data?.task_id === "string" && data.data.task_id) ||
      (typeof data?.task_id === "string" && data.task_id) ||
      "";

    const pollingUrl =
      (taskId ? `${activeBase}/${taskId}` : "") ||
      (typeof data?.links?.self === "string" && data.links.self) ||
      (typeof data?.links?.get === "string" && data.links.get) ||
      (typeof data?.status_url === "string" && data.status_url) ||
      (typeof data?.url === "string" ? data.url : "");

    if (pollingUrl) {
      // Increased polling limit to 100 iterations (approx 2 minutes) for high-load periods
      for (let i = 0; i < 100; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500)); // slightly longer delay


        const statusResp = await fetch(pollingUrl, { headers, signal: options.signal });
        const statusData = await statusResp.json().catch(() => null);

        if (!statusResp.ok) {
          const msg = statusData?.message || statusData?.error?.message || `Freepik polling failed (${statusResp.status})`;
          throw new Error(msg);
        }

        const statusUrl = tryReadUrl(statusData);
        if (statusUrl) return statusUrl;

        const state = String(statusData?.data?.status || statusData?.status || "").toLowerCase();
        if (state.includes("completed") || state.includes("finished") || state.includes("succeeded")) {
          const msg = statusData?.message || statusData?.data?.message;
          throw new Error(msg || "Freepik completed generation but no image URL was returned.");
        }
        if (state.includes("failed") || state.includes("error") || state.includes("rejected")) {
          throw new Error(statusData?.message || statusData?.data?.message || "Freepik image generation failed.");
        }
      }
    }

    throw new Error("Freepik image was not ready in time. Please try again.");
  }

  const key = options.apiKey || getNextKey(OPENROUTER_KEYS, 'openRouterIndex');
  if (key) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: options.prompt,
          model: options.model || "openai/dall-e-3",
          n: 1,
          size: "1024x1024"
        }),
        signal: options.signal
      });
      const data = await resp.json();
      if (resp.ok && data.data?.[0]?.url) return data.data[0].url;
      if (data.error?.message) throw new Error(data.error.message);
    } catch (e: any) {
      console.warn("Image gen via OpenRouter failed:", e.message);
    }
  }

  throw new Error("Image generation is currently unavailable. Please check your API configuration.");
}

/**
 * Removes the background from an image using Freepik's dedicated API.
 */
export async function runFreepikRemoveBg(imageUrlOrBase64: string, apiKey?: string, signal?: AbortSignal): Promise<string> {
  const inBrowser = typeof window !== "undefined";
  const requestBase = inBrowser ? FREEPIK_REMOVE_BG_PROXY : FREEPIK_REMOVE_BG_API;
  const freepikKey = apiKey || FREEPIK_API_KEY;

  if (!freepikKey && !inBrowser) {
    throw new Error("Freepik API key is required for background removal.");
  }

  const isBase64 = imageUrlOrBase64.startsWith("data:") || imageUrlOrBase64.length > 1000;
  const body = isBase64 
    ? { image_base64: imageUrlOrBase64 }
    : { image_url: imageUrlOrBase64 };

  const response = await fetch(requestBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(inBrowser ? {} : { "x-freepik-api-key": freepikKey as string }),
      ...(inBrowser && apiKey ? { "x-freepik-api-key": apiKey } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `Background removal failed (${response.status})`);
  }

  // Freepik Background Removal API returns { data: { url: "..." } } synchronous
  if (data?.data?.url) return data.data.url;
  if (data?.url) return data.url;

  throw new Error("Freepik removed background but no image URL was returned.");
}



/**
 * Fallback handler that uses the deployed chat edge function as a last-resort provider.
 * This function has access to server-side API keys (LOVABLE_API_KEY) so it works
 * even when no client-side keys are configured.
 */
async function runEdgeFunction(options: RouterOptions): Promise<void> {
  const edgeBase = resolveEdgeFunctionsBaseUrl();
  if (!edgeBase) throw new Error("Edge function not configured");

  const wantsLong = detectLongResponseIntent(options.messages);
  const response = await fetch(`${edgeBase}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: options.messages,
      provider: { activeProvider: "dalam", selectedModel: "google/gemini-2.5-flash" },
      mode: "auto",
      max_tokens: wantsLong ? 16384 : 4096,
      // Pass client-side search results to prevent redundant server-side search
      searchResults: options.searchResults || undefined,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`Edge function HTTP ${response.status}: ${errText}`);
  }

  if (!response.body) throw new Error("No response body from edge function");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done || options.signal?.aborted) break;
    const chunk = decoder.decode(value, { stream: true });
    const parsed = appendSseLines(sseBuffer, chunk);
    sseBuffer = parsed.buffer;

    for (const line of parsed.lines) {
      const dataStr = extractSseDataLine(line);
      if (!dataStr) continue;
      if (dataStr === '[DONE]') continue;
      try {
        const data = JSON.parse(dataStr);
        const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
        if (content) {
          const sanitized = sanitizeResponseContent(content);
          if (sanitized) options.onChunk(sanitized);
        }
      } catch {
        // Non-SSE response — try treating the whole chunk as text
        if (chunk.trim() && !chunk.startsWith('data:')) {
          try {
            const json = JSON.parse(chunk);
            const content = json.choices?.[0]?.message?.content || json.text;
            if (content) {
              const sanitized = sanitizeResponseContent(content);
              if (sanitized) options.onChunk(sanitized);
            }
          } catch {
            // Raw text response
            if (chunk.trim().length > 10) {
              const sanitized = sanitizeResponseContent(chunk);
              if (sanitized) options.onChunk(sanitized);
            }
          }
        }
      }
    }
  }

  const remaining = decoder.decode();
  if (remaining) {
    sseBuffer += remaining;
  }

  const flushed = appendSseLines(sseBuffer, "", true);
  for (const line of flushed.lines) {
    const dataStr = extractSseDataLine(line);
    if (!dataStr) continue;
    if (dataStr === '[DONE]') continue;
    try {
      const data = JSON.parse(dataStr);
      const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
      if (content) {
        const sanitized = sanitizeResponseContent(content);
        if (sanitized) options.onChunk(sanitized);
      }
    } catch {
      // Non-SSE response — try treating the whole chunk as text
      if (line.trim() && !line.trim().startsWith('data:')) {
        try {
          const json = JSON.parse(line);
          const content = json.choices?.[0]?.message?.content || json.text;
          if (content) {
            const sanitized = sanitizeResponseContent(content);
            if (sanitized) options.onChunk(sanitized);
          }
        } catch {
          if (line.trim().length > 10) {
            const sanitized = sanitizeResponseContent(line);
            if (sanitized) options.onChunk(sanitized);
          }
        }
      }
    }
  }
}

// ─── Unified Routing Logic ───

/**
 * Priority queues for providers based on user tiers.
 */
const FREE_QUEUE: (FallbackProvider | "edge")[] = ["nvidia", "gemini", "github", "edge", "pico"];
const BASIC_QUEUE: (FallbackProvider | "edge")[] = ["nvidia", "gemini", "github", "edge", "groq", "openrouter", "pico"];
const PRO_QUEUE: (FallbackProvider | "edge")[] = ["nvidia", "gemini", "github", "edge", "groq", "openrouter", "pico"];

const PROVIDER_SET = new Set<QueueProvider>(["pico", "groq", "openrouter", "gemini", "nvidia", "github", "edge"]);

function toQueueProvider(input?: string): QueueProvider | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (normalized === "dalam" || normalized === "lovable") return null;
  return PROVIDER_SET.has(normalized as QueueProvider) ? (normalized as QueueProvider) : null;
}

function getBaseQueue(tier: RouterOptions["tier"]): QueueProvider[] {
  if (tier === "free") return [...FREE_QUEUE];
  if (tier === "basic") return [...BASIC_QUEUE];
  return [...PRO_QUEUE];
}

function buildRotationQueue(tier: RouterOptions["tier"], preferredProvider?: string): QueueProvider[] {
  const baseQueue = getBaseQueue(tier);
  const preferred = toQueueProvider(preferredProvider);
  const withPreferred = preferred ? [preferred, ...baseQueue] : baseQueue;
  return withPreferred.filter((provider, index, all) => all.indexOf(provider) === index);
}

function resolveRotationPasses(rotationPasses?: number): number {
  const candidate = rotationPasses ?? envRotationPasses ?? DEFAULT_PROVIDER_ROTATION_PASSES;
  if (!Number.isFinite(candidate)) return DEFAULT_PROVIDER_ROTATION_PASSES;
  return clamp(Math.floor(candidate), 1, MAX_PROVIDER_ROTATION_PASSES);
}

function resolveProviderAttemptTimeoutMs(timeoutMs?: number): number {
  const candidate = timeoutMs ?? envProviderAttemptTimeout ?? DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS;
  if (!Number.isFinite(candidate)) return DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS;
  return clamp(Math.floor(candidate), MIN_PROVIDER_ATTEMPT_TIMEOUT_MS, MAX_PROVIDER_ATTEMPT_TIMEOUT_MS);
}

async function runProvider(provider: QueueProvider, options: RouterOptions): Promise<void> {
  if (provider === "pico") return runPico(options);
  if (provider === "groq") return runGroq(options);
  if (provider === "openrouter") return runOpenRouter(options);
  if (provider === "gemini") return runGemini(options);
  if (provider === "nvidia") return runNvidia(options);
  if (provider === "github") return runGithub(options);
  return runEdgeFunction(options);
}

async function runProviderWithTimeout(provider: QueueProvider, options: RouterOptions, timeoutMs: number): Promise<void> {
  const attemptController = new AbortController();

  const onParentAbort = () => {
    attemptController.abort(options.signal?.reason);
  };

  if (options.signal) {
    if (options.signal.aborted) {
      attemptController.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  const attemptOptions: RouterOptions = {
    ...options,
    signal: attemptController.signal,
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const providerPromise = runProvider(provider, attemptOptions);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      attemptController.abort();
      reject(new Error(`${provider} provider attempt timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([providerPromise, timeoutPromise]);
  } catch (error) {
    if (timedOut) {
      // Avoid unhandled rejection if provider exits after the timeout race already rejected.
      void providerPromise.catch(() => undefined);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener("abort", onParentAbort);
    }
  }
}

/**
 * Detects if the user query is a "simple" task that should use Lite by default.
 */
// eslint-disable-next-line unused-imports/no-unused-vars
function isSimpleTask(messages: ChatMessage[]): boolean {
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content || "";
  const q = lastUser.toLowerCase();
  
  // Tasks like searching agents, simple greetings, or very short queries
  const simpleKeywords = [
    "search agent", "find agent", "who is", "hello", "hi", "hey", 
    "what time", "help", "list", "show me", "clear", "reset"
  ];
  
  return q.length < 30 || simpleKeywords.some(k => q.includes(k));
}

/**
 * Orchestrates the routing of chat requests.
 * 1. Tries user-selected specific provider first.
 * 2. Falls back to a tiered priority queue.
 * 3. Handles automatic failover between providers in the queue.
 */
export async function routeDalamChat(options: RouterOptions): Promise<void> {
  const userId = options.userId || options.messages.find(m => m.role === 'system')?.content?.match(/user_id: ([\w-]+)/)?.[1];
  let sub: Awaited<ReturnType<typeof getUserSubscription>> = null;
  
  if (userId) {
    sub = await getUserSubscription(userId);
  }

  const isFreeAccount = !sub || sub.tier === "free" || !sub.subscription_active;

  if (userId && sub && !isFreeAccount) {
    const features = getEffectiveFeatures(sub);
    if (features.maxProRequestsPerDay !== -1 && sub.pro_requests_today >= features.maxProRequestsPerDay) {
      console.log(`[Dalam Router] Pro limit reached for user ${userId}.`);
    }
  }

  // 2. Build the queue
  const queue: QueueProvider[] = buildRotationQueue(options.tier, options.forcedProvider);

  const passes = resolveRotationPasses(options.rotationPasses);
  const attemptTimeoutMs = resolveProviderAttemptTimeoutMs(options.providerAttemptTimeoutMs);
  let lastError: unknown = null;
  const failures: string[] = [];

  for (let pass = 1; pass <= passes; pass += 1) {
    for (const provider of queue) {
      if (options.signal?.aborted) return;

      // Resolve the key that the provider will use for failure/success reporting
      const providerKeyMap: Record<string, "groq" | "gemini" | "nvidia" | "openrouter"> = {
        groq: "groq", gemini: "gemini", nvidia: "nvidia", openrouter: "openrouter",
      };
      const rotatorProvider = providerKeyMap[provider];
      const usedKey = rotatorProvider ? rotator.getKey(rotatorProvider) : null;

      try {
        console.log(`[Dalam Router] Attempting provider: ${provider} (pass ${pass}/${passes})`);
        await runProviderWithTimeout(provider, options, attemptTimeoutMs);
        
        // Report success to rotator for failure tracking
        if (rotatorProvider && usedKey) {
          rotator.reportSuccess(rotatorProvider, usedKey);
        }

        // Track all authenticated Dalam requests so the plan counters stay in sync.
        if (userId) {
          if (options.isVoice) {
            await trackVoiceUsage(userId);
          } else {
            await trackProUsage(userId);
          }
        }
        return;
      } catch (error: any) {
        const reason = error?.message || "Unknown error";
        console.warn(`[Dalam Router] Provider ${provider} failed on pass ${pass}:`, reason);
        failures.push(`${provider}#${pass}: ${reason}`);
        lastError = error;

        // Report failure to rotator for cooldown tracking
        if (rotatorProvider && usedKey) {
          rotator.reportFailure(rotatorProvider, usedKey);
        }
        
        // Try fallback if primary fails
        if (provider !== "pico" && !queue.includes("pico")) {
           try {
             console.log(`[Dalam Router] Provider failed, trying Pico as backup...`);
             await runPico(options);
             return;
           } catch (picoErr) {
             console.warn(`[Dalam Router] Backup also failed:`, picoErr);
           }
        }
      }
    }
  }

  const failureSummary = failures.length > 0 ? failures.join(" | ") : "No provider attempts recorded";
  throw new Error(`All AI providers failed after ${passes} rotation pass(es). Last error: ${String((lastError as any)?.message || "Unknown")}. Attempts: ${failureSummary}`);
}

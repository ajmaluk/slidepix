import type { ChatAttachment } from "@/lib/chat";
import { dalamDB, type IDBOCRResult, type IDBOCRResultHistoryEntry } from "./indexedDB";
import { tesseractPool } from "./tesseractPool";
import { authClient } from "./authClient";
import { extractTextFromPDF } from "./pdfExtractor";
import { resolveAttachmentUrl } from "./localAttachmentStore";

export type OCRStatus = "pending" | "scanning" | "success" | "failed";

export type OCRResult = {
  attachmentId: string;
  status: OCRStatus;
  extractedText: string;
  structuredData: string;
  metadata: string;
  isLargeDoc?: boolean;
  model?: string;
  version?: number;
  timestamp?: number;
  history?: OCRResultSnapshot[];
};

export type OCRResultSnapshot = {
  id: string;
  status: OCRStatus;
  extractedText: string;
  structuredData: string;
  metadata: string;
  isLargeDoc?: boolean;
  model?: string;
  version: number;
  timestamp: number;
};

type OCRMemoryMessage = {
  role: "user" | "assistant" | "system";
  ocrResults?: OCRResult[];
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const PDF_TYPE = "application/pdf";
const OCR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OCR_MAX_CONCURRENT = 6;
const OCR_RESULT_VERSION = 1;
let ocrInFlight = 0;
const CLOUD_OCR_FLAG = "dalam_cloud_ocr_enabled";

function isCloudOCREnabled(): boolean {
  try {
    return localStorage.getItem(CLOUD_OCR_FLAG) === "true";
  } catch {
    return false;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to convert blob"));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

async function getOCRUsableUrl(att: ChatAttachment): Promise<string> {
  if (att.url) return att.url;
  const resolved = await resolveAttachmentUrl(att);
  if (resolved) return resolved;
  return "";
}

function emptyFailedResult(att: ChatAttachment, reason = "OCR unavailable"): OCRResult {
  return {
    attachmentId: att.id,
    status: "failed",
    extractedText: "",
    structuredData: "",
    metadata: reason,
    model: "none",
    version: OCR_RESULT_VERSION,
    timestamp: Date.now(),
    history: [],
  };
}

function toSnapshot(entry: IDBOCRResultHistoryEntry): OCRResultSnapshot {
  return {
    id: entry.id,
    status: entry.status,
    extractedText: entry.extractedText,
    structuredData: entry.structuredData,
    metadata: entry.metadata,
    isLargeDoc: entry.isLargeDoc,
    model: entry.model,
    version: entry.version,
    timestamp: entry.timestamp,
  };
}

async function maybeReadCachedOCR(attachmentId: string): Promise<OCRResult | null> {
  try {
    const cached = await dalamDB.getOCRResult(attachmentId);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > OCR_CACHE_TTL_MS) return null;
    const historyRows = await dalamDB.getOCRResultHistory(attachmentId, 10);
    return {
      attachmentId: cached.attachmentId,
      status: cached.status,
      extractedText: cached.extractedText,
      structuredData: cached.structuredData,
      metadata: cached.metadata,
      isLargeDoc: cached.isLargeDoc,
      model: cached.model,
      version: cached.version,
      timestamp: cached.timestamp,
      history: historyRows.map(toSnapshot),
    };
  } catch {
    return null;
  }
}

async function persistOCR(result: OCRResult): Promise<void> {
  try {
    const now = result.timestamp ?? Date.now();
    const payload: IDBOCRResult = {
      attachmentId: result.attachmentId,
      status: result.status,
      extractedText: result.extractedText,
      structuredData: result.structuredData,
      metadata: result.metadata,
      isLargeDoc: result.isLargeDoc,
      model: result.model,
      version: result.version ?? OCR_RESULT_VERSION,
      timestamp: now,
    };
    const historyEntry: IDBOCRResultHistoryEntry = {
      id: `${result.attachmentId}_${now}_${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    };
    await dalamDB.saveOCRResult(payload);
    await dalamDB.saveOCRResultHistoryEntry(historyEntry);

    const historyRows = await dalamDB.getOCRResultHistory(result.attachmentId, 10);
    result.history = historyRows.map(toSnapshot);
  } catch {
    // OCR persistence is best effort and should never block the chat flow.
  }
}

export function isImageAttachment(att: ChatAttachment): boolean {
  return IMAGE_TYPES.includes(att.type);
}

export function isPDFAttachment(att: ChatAttachment): boolean {
  return att.type === PDF_TYPE;
}

export function isOCRCapable(att: ChatAttachment): boolean {
  return isImageAttachment(att) || isPDFAttachment(att);
}

/** Run local OCR using Tesseract.js or cloud OCR via Gemini */
export async function runOCRForAttachment(
  att: ChatAttachment,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<OCRResult> {
  if (!isOCRCapable(att)) {
    return emptyFailedResult(att, "Attachment type not OCR capable");
  }

  if (signal?.aborted) {
    return emptyFailedResult(att, "OCR aborted");
  }

  const cached = await maybeReadCachedOCR(att.id);
  if (cached) {
    if (onProgress) onProgress(100);
    return cached;
  }

  if (ocrInFlight >= OCR_MAX_CONCURRENT) {
    return emptyFailedResult(att, "OCR rate limit reached. Please retry in a moment.");
  }

  ocrInFlight += 1;

  try {
    const usableUrl = await getOCRUsableUrl(att);
    if (!usableUrl) {
      const failed = emptyFailedResult(att, "Attachment source unavailable");
      await persistOCR(failed);
      return failed;
    }

    // 1. PDF Handling (High Performance Browser-side Extraction)
    if (isPDFAttachment(att)) {
      try {
        console.log(`🚀 Using PDF.js for extraction: ${att.name}`);
        const result = await extractTextFromPDF(usableUrl, onProgress);
        
        if (signal?.aborted) throw new Error("OCR aborted");

        const ocrResult: OCRResult = {
          attachmentId: att.id,
          status: "success",
          extractedText: result.text,
          structuredData: "",
          metadata: JSON.stringify({ 
            pages: result.pages, 
            isScanned: result.isScanned,
            method: "pdfjs" 
          }),
          isLargeDoc: result.pages > 5,
          model: result.isScanned ? "tesseract" : "pdfjs",
          version: OCR_RESULT_VERSION,
          timestamp: Date.now(),
        };
        await persistOCR(ocrResult);
        return ocrResult;
      } catch (err) {
        if (signal?.aborted) throw err;
        console.warn("PDF.js extraction failed, falling back to Gemini:", err);
      }
    }

    // 2. Image Handling (Try Gemini Edge Function first for high quality)
    if (isImageAttachment(att)) {
      if (isCloudOCREnabled()) {
        try {
          if (signal?.aborted) throw new Error("OCR aborted");
          let cloudUrl = usableUrl;
          if (cloudUrl.startsWith("blob:")) {
            const blob = await fetch(cloudUrl).then((r) => r.blob());
            cloudUrl = await blobToDataUrl(blob);
          }
          console.log(`🚀 Using Gemini-powered Edge Function for Image OCR: ${att.name}`);
          const { data, error } = await authClient.functions.invoke("ocr-analyze", {
            body: { imageUrls: [cloudUrl], pdfUrls: [] }
          });

          if (signal?.aborted) throw new Error("OCR aborted");

          if (!error && data?.results?.[cloudUrl]) {
            const results = data.results[cloudUrl] || [];
            const textExtractor = results.find((r: any) => r.agent === "text-extractor");
            
            if (textExtractor?.success) {
              const ocrResult: OCRResult = {
                attachmentId: att.id,
                status: "success",
                extractedText: textExtractor.result,
                structuredData: "",
                metadata: JSON.stringify({ model: "gemini-2.5-flash", source: "edge-function" }),
                model: "gemini",
                version: OCR_RESULT_VERSION,
                timestamp: Date.now(),
              };
              await persistOCR(ocrResult);
              return ocrResult;
            }
          }
        } catch (err) {
          if (signal?.aborted) throw err;
          console.warn("Cloud OCR failed, falling back to local Tesseract:", err);
        }
      }
    }

    // 3. Final Local Fallback (Tesseract.js worker pool)
    let text = "";
    try {
      if (signal?.aborted) throw new Error("OCR aborted");
      const worker = await tesseractPool.getWorker();
      
      if (signal?.aborted) {
        tesseractPool.releaseWorker(worker as any);
        throw new Error("OCR aborted");
      }

      const { data: { text: extractedText } } = await (worker as any).recognize(usableUrl);
      text = extractedText;
      tesseractPool.releaseWorker(worker as any);
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn("Tesseract worker recognition failed:", err);
      throw err;
    }

    if (signal?.aborted) throw new Error("OCR aborted");

    if (!text || text.trim().length === 0) {
      const failed = emptyFailedResult(att, "OCR returned empty text");
      await persistOCR(failed);
      return failed;
    }

    const ocrResult: OCRResult = {
      attachmentId: att.id,
      status: "success",
      extractedText: text,
      structuredData: "",
      metadata: "",
      model: "tesseract",
      version: OCR_RESULT_VERSION,
      timestamp: Date.now(),
    };
    await persistOCR(ocrResult);
    return ocrResult;

  } catch (err) {
    if (signal?.aborted) {
      console.log(`⏹️ OCR aborted for ${att.name}`);
      return emptyFailedResult(att, "OCR aborted");
    }
    console.warn("OCR failed for", att.name, err);
    const failed = emptyFailedResult(att, `OCR failed: ${err instanceof Error ? err.message : "unknown"}`);
    await persistOCR(failed);
    return failed;
  } finally {
    ocrInFlight = Math.max(ocrInFlight - 1, 0);
  }
}

/** Build context string from OCR results for injection into the chat prompt */
export function buildOCRContext(results: OCRResult[], attachments: ChatAttachment[]): string {
  const successful = results.filter((r) => r.status === "success");
  if (successful.length === 0) return "";

  return successful
    .map((r) => {
      const att = attachments.find((a) => a.id === r.attachmentId);
      const name = att?.name || "Document";
      const type = att?.type || "unknown";
      const parts: string[] = [];

      parts.push(`[DOCUMENT ATTACHMENT: ${name}]`);
      parts.push(`Type: ${type}`);

      if (r.extractedText.trim()) {
        const text = r.extractedText.trim();
        const isLarge = r.isLargeDoc || text.length > 15000;
        
        if (isLarge) {
          parts.push(`[EXTRACTED TEXT SUMMARY (LARGE DOCUMENT)]\n${text.slice(0, 10000)}...`);
          parts.push(`[SYSTEM NOTE: This is a large document. The above is a 10,000-character preview. The full content has been indexed and is available for semantic search.]`);
        } else {
          parts.push(`[EXTRACTED TEXT]\n${text}`);
        }
      }

      parts.push(`[INSTRUCTION: The user has uploaded a document. Your primary goal is to answer questions BASED ON THE EXTRACTED TEXT ABOVE. If the user asks for specific details, look at the [EXTRACTED TEXT] block. Do not hallucinate questions not present in the text.]`);

      return parts.join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * Build compact OCR memory lines from recent user turns so later unrelated
 * prompts can still reference uploaded document facts.
 */
export function buildRecentOCRMemoryLines(
  messages: OCRMemoryMessage[],
  options?: { recentUserMessages?: number; maxItems?: number; maxCharsPerItem?: number }
): string[] {
  const recentUserMessages = options?.recentUserMessages ?? 3;
  const maxItems = options?.maxItems ?? 4;
  const maxCharsPerItem = options?.maxCharsPerItem ?? 260;

  const compact = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

  const entries = messages
    .filter((m) => m.role === "user" && Array.isArray(m.ocrResults) && m.ocrResults.length > 0)
    .slice(-recentUserMessages)
    .flatMap((m) =>
      (m.ocrResults || [])
        .filter((r) => r.status === "success" && (r.extractedText || "").trim().length > 0)
        .map((r) => ({
          attachmentId: r.attachmentId,
          text: compact(r.extractedText || "", maxCharsPerItem),
        }))
    )
    .slice(0, maxItems);

  if (entries.length === 0) return [];

  return [
    "[Recent OCR Memory]",
    ...entries.map((item) => `OCR ${item.attachmentId}: ${item.text}`),
  ];
}

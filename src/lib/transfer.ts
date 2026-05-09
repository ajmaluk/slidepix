import type { Conversation, Message, ChatAttachment } from "@/lib/chat";
import { loadConversations, persistConversations } from "@/hooks/useChatPersistence";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings";
import { dalamDB } from "@/lib/indexedDB";

const CHAT_STORAGE_KEY = "dalam-chat-conversations";
const IMAGE_SETTINGS_KEY = "dalam-image-provider-settings";
const BRAIN_PROFILE_KEY = "user_brain_profile";

const AGENT_MEMORY_KEYS = [
  "dalam_global_patterns",
  "dalam_user_preferences",
  "dalam_agent_memory_arun",
  "dalam_agent_memory_nila",
  "dalam_agent_memory_arjun",
  "dalam_agent_memory_deepa",
  "dalam_agent_memory_kiran",
  "dalam_agent_memory_maya",
  "dalam_agent_memory_ravi",
  "dalam_agent_memory_isha",
  "dalam_agent_memory_lakshmi",
  "dalam_agent_memory_priya",
] as const;

export interface OCRDocument {
  id: string;
  conversationId: string;
  messageId: string;
  title: string;
  content: string;
  attachmentHints: string[];
  createdAt: string;
}

export type DalamTransferFile = DalamTransferFileV1 | DalamTransferFileV2;

export interface DalamTransferFileV1 {
  format: "dalam-transfer-v1";
  exportedAt: string;
  app: {
    name: "Dalam";
    version: string;
  };
  settings: AppSettings;
  imageSettingsRaw: string | null;
  brainProfileRaw: string | null;
  agentMemory: Record<string, string>;
  conversations: Conversation[];
  ocrDocuments: OCRDocument[];
}

export interface DalamTransferFileV2 {
  format: "dalam-transfer-v2";
  exportedAt: string;
  app: {
    name: "Dalam";
    version: string;
  };
  settings: AppSettings;
  imageSettingsRaw: string | null;
  brainProfileRaw: string | null;
  agentMemory: Record<string, string>;
  conversations: Conversation[];
  ocrDocuments: OCRDocument[];
  scope?: "full" | "single";
}

export interface EncryptedDalamTransferFile {
  format: "dalam-transfer-v2-encrypted";
  encrypted: true;
  exportedAt: string;
  app: {
    name: "Dalam";
    version: string;
  };
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    saltB64: string;
  };
  cipher: {
    name: "AES-GCM";
    ivB64: string;
  };
  payloadB64: string;
}

export type ImportStrategy = "override" | "append";

export interface DalamTransferPreview {
  encrypted: boolean;
  conversationCount: number;
}

export class DalamTransferError extends Error {
  code: "INVALID_FILE" | "PASSWORD_REQUIRED" | "DECRYPT_FAILED";

  constructor(code: DalamTransferError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const PBKDF2_ITERATIONS = 250000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(plainText: string, password: string): Promise<EncryptedDalamTransferFile> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(enc.encode(plainText))
  );

  return {
    format: "dalam-transfer-v2-encrypted",
    encrypted: true,
    exportedAt: new Date().toISOString(),
    app: {
      name: "Dalam",
      version: "1.0.0",
    },
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      saltB64: bytesToBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      ivB64: bytesToBase64(iv),
    },
    payloadB64: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptPayload(file: EncryptedDalamTransferFile, password: string): Promise<string> {
  try {
    const salt = base64ToBytes(file.kdf.saltB64);
    const iv = base64ToBytes(file.cipher.ivB64);
    const payload = base64ToBytes(file.payloadB64);
    const key = await deriveAesKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(payload)
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    throw new DalamTransferError("DECRYPT_FAILED", "Incorrect password or corrupted encrypted backup.");
  }
}

function isTempConversation(conv: Conversation): boolean {
  return conv.id.startsWith("temp_");
}

function sanitizeMessage(message: Message): Message {
  const sanitizeAttachments = (atts?: ChatAttachment[]) =>
    atts?.map((att) => {
      const safeUrl = typeof att.url === "string" ? att.url : "";
      const isLargeDataUrl = safeUrl.startsWith("data:") && safeUrl.length > 1024 * 1024; // > 1MB
      return {
        ...att,
        url: isLargeDataUrl ? "" : safeUrl,
        _isImported: true,
      };
    });

  const sanitizeOCRResults = (results?: Message["ocrResults"]) =>
    results?.map((result) => ({
      ...result,
      extractedText: result.extractedText || "",
      structuredData: result.structuredData || "",
      metadata: result.metadata || "",
      history: Array.isArray(result.history)
        ? result.history.map((entry) => ({
            ...entry,
            extractedText: entry.extractedText || "",
            structuredData: entry.structuredData || "",
            metadata: entry.metadata || "",
          }))
        : undefined,
    }));

  const allVersions = [
    // Start with the active message content as a base version
    {
      id: `${message.id}_base`,
      content: message.content,
      timestamp: message.timestamp,
      searchQuery: message.searchQuery,
      sources: message.sources,
      attachments: message.attachments,
    },
    ...(message.versions || []),
  ];

  // Remove duplicates, keeping the last occurrence
  const uniqueVersions = Array.from(new Map(allVersions.map((v) => [v.id, v])).values());

  const cleanedVersions = uniqueVersions.map((v) => ({
    ...v,
    attachments: sanitizeAttachments(v.attachments),
  }));

  return {
    ...message,
    attachments: sanitizeAttachments(message.attachments),
    ocrResults: sanitizeOCRResults(message.ocrResults),
    versions: cleanedVersions,
    content: message.content,
  };
}

function extractOCRDocuments(conversations: Conversation[]): OCRDocument[] {
  const docs: OCRDocument[] = [];

  for (const conv of conversations) {
    // Legacy compatibility: old backups may still contain OCR as system messages.
    for (const msg of conv.messages) {
      if (msg.role !== "system") continue;
      if (!msg.content.startsWith("[Image OCR Analysis]")) continue;

      const content = msg.content.replace(/^\[Image OCR Analysis\]\n*/i, "").trim();
      if (!content) continue;

      docs.push({
        id: `ocr_${msg.id}`,
        conversationId: conv.id,
        messageId: msg.id,
        title: `OCR Document (${conv.title.slice(0, 40)})`,
        content,
        attachmentHints: [],
        createdAt: msg.timestamp.toISOString(),
      });
    }

    // Current format: OCR is stored as metadata on the user message itself.
    for (const msg of conv.messages) {
      if (!msg.ocrResults || msg.ocrResults.length === 0) continue;
      const contentChunks: string[] = [];

      for (const result of msg.ocrResults) {
        const extracted = (result.extractedText || "").trim();
        const structured = (result.structuredData || "").trim();
        const metadata = (result.metadata || "").trim();
        if (!extracted && !structured && !metadata) continue;

        const attName = msg.attachments?.find((a) => a.id === result.attachmentId)?.name || "Attachment";
        const parts = [`### ${attName}`];
        if (extracted) parts.push(`Text:\n${extracted}`);
        if (structured) parts.push(`Structured Data:\n${structured}`);
        if (metadata) parts.push(`Metadata:\n${metadata}`);
        contentChunks.push(parts.join("\n\n"));
      }

      if (contentChunks.length === 0) continue;

      docs.push({
        id: `ocr_${msg.id}`,
        conversationId: conv.id,
        messageId: msg.id,
        title: `OCR Document (${conv.title.slice(0, 40)})`,
        content: contentChunks.join("\n\n---\n\n"),
        attachmentHints: msg.attachments?.map((a) => a.name) ?? [],
        createdAt: msg.timestamp.toISOString(),
      });
    }

    // For attachment messages with no OCR system message, include a small note doc.
    for (const msg of conv.messages) {
      if (!msg.attachments || msg.attachments.length === 0) continue;
      const hasOCRDoc = docs.some((d) => d.conversationId === conv.id && d.messageId === msg.id);
      if (hasOCRDoc) continue;

      const names = msg.attachments.map((a) => a.name);
      docs.push({
        id: `ocr_hint_${msg.id}`,
        conversationId: conv.id,
        messageId: msg.id,
        title: `Attachment OCR Summary (${conv.title.slice(0, 40)})`,
        content: "No OCR text was stored for this attachment set in local data. Only metadata was exported.",
        attachmentHints: names,
        createdAt: msg.timestamp.toISOString(),
      });
    }
  }

  return docs;
}

function collectAgentMemory(): Record<string, string> {
  const memory: Record<string, string> = {};
  for (const key of AGENT_MEMORY_KEYS) {
    const value = localStorage.getItem(key);
    if (value) memory[key] = value;
  }
  return memory;
}

export async function uploadForSharing(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("https://file.io/?expires=1d", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload file for sharing.");
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error("Failed to get a shareable link.");
  }

  return result.link;
}

export function isWebShareSupported(): boolean {
  return "canShare" in navigator && "share" in navigator;
}

export async function exportDalamFile(options?: { conversationIds?: string[]; scope?: "full" | "single"; password?: string }): Promise<Blob> {
  const requestedIds = options?.conversationIds ? new Set(options.conversationIds) : null;
  const rawConversations = (await loadConversations()).filter((c) => {
    if (isTempConversation(c)) return false;
    if (!requestedIds) return true;
    return requestedIds.has(c.id) || (c.shortId ? requestedIds.has(c.shortId) : false);
  });
  const ocrDocuments = extractOCRDocuments(rawConversations);
  const conversations = rawConversations.map((conv) => ({
    ...conv,
    messages: conv.messages.map(sanitizeMessage),
  }));

  const transfer: DalamTransferFileV2 = {
    format: "dalam-transfer-v2",
    exportedAt: new Date().toISOString(),
    app: {
      name: "Dalam",
      version: "1.0.0",
    },
    settings: loadSettings(),
    imageSettingsRaw: localStorage.getItem(IMAGE_SETTINGS_KEY),
    brainProfileRaw: localStorage.getItem(BRAIN_PROFILE_KEY),
    agentMemory: collectAgentMemory(),
    conversations,
    ocrDocuments,
    scope: options?.scope ?? "full",
  };

  const serialized = JSON.stringify(transfer, null, 2);
  const password = options?.password?.trim();
  if (password) {
    const encrypted = await encryptPayload(serialized, password);
    const encryptedSerialized = JSON.stringify(encrypted, null, 2);
    return new Blob([encryptedSerialized], { type: "application/json" });
  }

  return new Blob([serialized], { type: "application/json" });
}

export async function exportSingleConversationFile(conversationIdOrShortId: string, options?: { password?: string }): Promise<Blob> {
  const all = (await loadConversations()).filter((c) => !isTempConversation(c));
  const found = all.find((c) => c.id === conversationIdOrShortId || c.shortId === conversationIdOrShortId);
  if (!found) {
    throw new DalamTransferError("INVALID_FILE", "Conversation not found for single-chat export.");
  }
  return exportDalamFile({ conversationIds: [conversationIdOrShortId], scope: "single", password: options?.password });
}

async function decodeTransferContent(
  parsed: DalamTransferFile | EncryptedDalamTransferFile,
  password?: string
): Promise<DalamTransferFile> {
  let plainTransfer: DalamTransferFile;

  if (parsed && parsed.format === "dalam-transfer-v2-encrypted") {
    const supplied = password?.trim();
    if (!supplied) {
      throw new DalamTransferError("PASSWORD_REQUIRED", "This backup is encrypted. Password is required.");
    }

    const decryptedText = await decryptPayload(parsed, supplied);
    plainTransfer = JSON.parse(decryptedText) as DalamTransferFile;
  } else {
    plainTransfer = parsed as DalamTransferFile;
  }

  if (!plainTransfer || !("format" in plainTransfer) || (plainTransfer.format !== "dalam-transfer-v1" && plainTransfer.format !== "dalam-transfer-v2")) {
    throw new DalamTransferError("INVALID_FILE", "Invalid .dalam file format");
  }

  // Backward/forward compatibility: allow single-entity payloads that use `conversation`.
  const maybeSingle = (plainTransfer as any).conversation;
  if (!Array.isArray((plainTransfer as any).conversations) && maybeSingle && typeof maybeSingle === "object") {
    (plainTransfer as any).conversations = [maybeSingle];
  }

  return plainTransfer;
}

function migrateV1MessageToV2(message: Message): Message {
  const normalizedTimestamp = new Date((message as any).timestamp ?? Date.now());
  if (message.versions && message.versions.length > 0) {
    return {
      ...message,
      timestamp: Number.isNaN(normalizedTimestamp.getTime()) ? new Date() : normalizedTimestamp,
    }; // Already has versions, likely v2
  }

  const safeTimestamp = Number.isNaN(normalizedTimestamp.getTime()) ? new Date() : normalizedTimestamp;
  return {
    ...message,
    timestamp: safeTimestamp,
    versions: [
      {
        id: `${message.id}_base`,
        content: message.content,
        timestamp: safeTimestamp,
        searchQuery: message.searchQuery,
        sources: message.sources,
        attachments: message.attachments,
      },
    ],
  };
}

function toSafeDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeImportedMessage(rawMessage: any): Message {
  const versions = Array.isArray(rawMessage?.versions)
    ? rawMessage.versions.map((version: any) => ({
        ...version,
        timestamp: toSafeDate(version?.timestamp),
        trailingMessages: Array.isArray(version?.trailingMessages)
          ? version.trailingMessages.map((trailing: any) => normalizeImportedMessage(trailing))
          : version?.trailingMessages,
      }))
    : rawMessage?.versions;

  return {
    ...rawMessage,
    timestamp: toSafeDate(rawMessage?.timestamp),
    versions,
  };
}

function normalizeConversationDates(conversation: any): Conversation {
  return {
    ...conversation,
    createdAt: toSafeDate(conversation?.createdAt),
    messages: Array.isArray(conversation?.messages)
      ? conversation.messages.map((message: any) => normalizeImportedMessage(message))
      : [],
  };
}

function normalizeImportConversations(conversations: Conversation[], format: string): Conversation[] {
  const filtered = conversations
    .filter((c) => !c.id.startsWith("temp_"))
    .map((conversation) => normalizeConversationDates(conversation));

  if (format === "dalam-transfer-v1") {
    return filtered.map((conv) => ({
      ...conv,
      messages: conv.messages.map(migrateV1MessageToV2),
    }));
  }
  return filtered;
}

function buildConversationContentPayload(conv: Conversation) {
  return {
    title: conv.title,
    messages: conv.messages.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: (m.attachments || []).map((a) => ({
        name: a.name,
        type: a.type,
        size: a.size,
        ocrText: a.ocrText || "",
      })),
    })),
  };
}

async function getConversationContentFingerprint(conv: Conversation): Promise<string> {
  const payload = JSON.stringify(buildConversationContentPayload(conv));
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToBase64(new Uint8Array(digest));
}

async function mergeConversationsForAppend(existing: Conversation[], incoming: Conversation[]): Promise<Conversation[]> {
  const usedIds = new Set(existing.map((c) => c.id));
  const fingerprints = new Map<string, string>();

  for (const conv of existing) {
    try {
      fingerprints.set(await getConversationContentFingerprint(conv), conv.id);
    } catch (err) {
      void err;
    }
  }

  const now = Date.now();
  const mergedIncoming: Conversation[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const conv = incoming[i];
    let fp: string | null = null;
    try {
      fp = await getConversationContentFingerprint(conv);
    } catch (err) {
      void err;
    }

    if (fp && fingerprints.has(fp)) continue;

    if (!usedIds.has(conv.id)) {
      usedIds.add(conv.id);
      mergedIncoming.push(conv);
      if (fp) fingerprints.set(fp, conv.id);
      continue;
    }

    const nextId = `${conv.id}_import_${now}_${i}`;
    usedIds.add(nextId);
    const rewritten = {
      ...conv,
      id: nextId,
      title: conv.title.includes("(Imported)") ? conv.title : `${conv.title} (Imported)`,
    };
    mergedIncoming.push(rewritten);
    if (fp) fingerprints.set(fp, nextId);
  }

  return [...existing, ...mergedIncoming];
}

export async function previewDalamFile(file: File, password?: string): Promise<DalamTransferPreview> {
  const text = await file.text();
  const parsed = JSON.parse(text) as DalamTransferFile | EncryptedDalamTransferFile;
  const plainTransfer = await decodeTransferContent(parsed, password);

  return {
    encrypted: parsed.format === "dalam-transfer-v2-encrypted",
    conversationCount: normalizeImportConversations(plainTransfer.conversations || [], plainTransfer.format).length,
  };
}

export async function importDalamFile(
  file: File,
  password?: string,
  options?: { strategy?: ImportStrategy }
): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text) as DalamTransferFile | EncryptedDalamTransferFile;
  const plainTransfer = await decodeTransferContent(parsed, password);

  // Settings
  if (plainTransfer.settings) {
    saveSettings(plainTransfer.settings);
  }

  // Image settings
  if (typeof plainTransfer.imageSettingsRaw === "string") {
    localStorage.setItem(IMAGE_SETTINGS_KEY, plainTransfer.imageSettingsRaw);
  }

  // Brain profile
  if (typeof plainTransfer.brainProfileRaw === "string") {
    localStorage.setItem(BRAIN_PROFILE_KEY, plainTransfer.brainProfileRaw);
  }

  // Agent memory
  if (plainTransfer.agentMemory && typeof plainTransfer.agentMemory === "object") {
    for (const [key, value] of Object.entries(plainTransfer.agentMemory)) {
      localStorage.setItem(key, value);
    }
  }

  // Conversations (never import temp chat IDs)
  const cleanedConversations = normalizeImportConversations(plainTransfer.conversations || [], plainTransfer.format);
  const strategy = options?.strategy ?? "override";
  let finalConversations: Conversation[];

  if (strategy === "append") {
    const existingConversations = (await loadConversations()).filter((c) => !c.id.startsWith("temp_"));
    finalConversations = await mergeConversationsForAppend(existingConversations, cleanedConversations);
  } else {
    finalConversations = cleanedConversations;

    // Remove old IndexedDB conversations so override import is truly authoritative.
    try {
      const existing = await dalamDB.getAllConversations();
      for (const conv of existing) {
        if (!finalConversations.some((c) => c.id === conv.id)) {
          await dalamDB.deleteConversation(conv.id);
        }
      }
    } catch (err) {
      console.warn("Failed to prune IndexedDB during override import:", err);
    }
  }

  // Persist imported conversations to both stores so next reload is consistent.
  await persistConversations(finalConversations);

  // Keep canonical localStorage key aligned with full imported payload for compatibility.
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(finalConversations));
}

export function getDalamFileName(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `dalam-backup-${yyyy}${mm}${dd}-${hh}${min}.dalam`;
}

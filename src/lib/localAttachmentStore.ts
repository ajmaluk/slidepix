import type { ChatAttachment } from "@/lib/chat";
import { generateId } from "@/lib/chat";
import { dalamDB } from "@/lib/indexedDB";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const objectUrlCache = new Map<string, string>();

export async function saveAttachmentLocally(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name}" exceeds 20MB limit`);
  }

  const id = generateId();
  await dalamDB.saveAttachmentBlob(id, file, { type: file.type, name: file.name, size: file.size });
  const url = URL.createObjectURL(file);
  objectUrlCache.set(id, url);

  return {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    url,
    storage: "idb",
    blobId: id,
  };
}

export async function resolveAttachmentUrl(att: ChatAttachment): Promise<string | null> {
  if (!att) return null;
  if (att.url && !att.url.startsWith("blob:")) return att.url;
  if (att.url && att.url.startsWith("blob:")) return att.url;

  const blobId = att.blobId || att.id;
  const cached = objectUrlCache.get(blobId);
  if (cached) return cached;

  const blob = await dalamDB.getAttachmentBlob(blobId);
  if (blob) {
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(blobId, url);
    return url;
  }

  return null;
}

export function releaseAttachmentUrl(att: ChatAttachment) {
  const blobId = att.blobId || att.id;
  const cached = objectUrlCache.get(blobId);
  if (cached) {
    URL.revokeObjectURL(cached);
    objectUrlCache.delete(blobId);
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma);
  const b64 = dataUrl.slice(comma + 1);
  const isBase64 = /;base64/i.test(meta);
  const mime = meta.split(";")[0] || "application/octet-stream";
  if (!isBase64) return new Blob([decodeURIComponent(b64)], { type: mime });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function migrateInlineAttachmentToIdb(att: ChatAttachment): Promise<ChatAttachment> {
  if (!att?.url || !att.url.startsWith("data:")) return att;
  if (att.storage === "idb") return att;
  if (att.url.length < 256 * 1024) return att;

  const blob = dataUrlToBlob(att.url);
  if (!blob) return att;

  const blobId = att.blobId || att.id;
  await dalamDB.saveAttachmentBlob(blobId, blob, { type: att.type, name: att.name, size: att.size });
  return { ...att, url: "", storage: "idb", blobId };
}

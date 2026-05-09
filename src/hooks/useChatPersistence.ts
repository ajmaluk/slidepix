import { useEffect, useRef } from "react";
import type { Conversation, Message } from "@/lib/chat";
import { dalamDB } from "@/lib/indexedDB";
import { recordTelemetry, startTimer } from "@/lib/telemetry";
import { migrateInlineAttachmentToIdb } from "@/lib/localAttachmentStore";

const STORAGE_KEY = "dalam-chat-conversations";

/** Revive Date strings from storage */
function reviveDates(obj: unknown): unknown {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object)) {
      const val = (obj as Record<string, unknown>)[key];
      if ((key === "timestamp" || key === "createdAt") && typeof val === "string") {
        result[key] = new Date(val);
      } else {
        result[key] = reviveDates(val);
      }
    }
    return result;
  }
  return obj;
}

interface RawMessage {
  timestamp?: string | Date;
  thinkingSteps?: unknown;
  versions?: unknown;
  [key: string]: unknown;
}

interface RawConversation {
  id?: string | number;
  shortId?: string;
  messages?: RawMessage[];
  title?: string;
  createdAt?: string | Date;
}

function normalizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawConversation;
  if (!r.id || !Array.isArray(r.messages)) return null;

  const messages: Message[] = r.messages.map((m) => ({
    ...m,
    timestamp: m?.timestamp ? new Date(m.timestamp) : new Date(),
    thinkingSteps: reviveDates(m?.thinkingSteps) as any,
    versions: reviveDates(m?.versions) as any,
  } as Message));

  return {
    id: String(r.id),
    shortId: typeof r.shortId === "string" ? r.shortId : undefined,
    title: typeof r.title === "string" ? r.title : "New conversation",
    messages,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
  };
}

function isConversationRicher(next: Conversation, current: Conversation): boolean {
  if (next.messages.length !== current.messages.length) {
    return next.messages.length > current.messages.length;
  }
  return next.createdAt.getTime() > current.createdAt.getTime();
}

/** Save FULL conversations to localStorage (not just metadata) */
function saveToLocalStorage(conversations: Conversation[]) {
  if (typeof window === "undefined" || conversations.length === 0) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // If full payload is too large, save with truncated messages (keep last 20 per conv)
    try {
      const trimmed = conversations.map(c => ({
        ...c,
        messages: c.messages.slice(-20),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Last resort: just IDs and titles
      try {
        const meta = conversations.map(c => ({
          id: c.id, title: c.title, createdAt: c.createdAt, messages: c.messages.slice(-2),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
      } catch {
        // All storage attempts failed
      }
    }
  }
}

async function migrateConversationAttachments(conversations: Conversation[], maxToMigrate: number): Promise<Conversation[]> {
  let remaining = maxToMigrate;
  let didChange = false;

  const migrated = await Promise.all(
    conversations.map(async (conv) => {
      let convChanged = false;
      const updatedMessages = await Promise.all(
        conv.messages.map(async (m) => {
          if ((!m.attachments || m.attachments.length === 0) && (!m.versions || m.versions.length === 0)) return m;

          let changed = false;
          const updatedAttachments = m.attachments
            ? await Promise.all(
                m.attachments.map(async (a) => {
                  if (remaining <= 0) return a;
                  if (!a.url || !a.url.startsWith("data:")) return a;
                  if (a.storage === "idb") return { ...a, url: "" };
                  if (a.url.length < 256 * 1024) return a;
                  remaining -= 1;
                  const migratedAtt = await migrateInlineAttachmentToIdb(a);
                  if (migratedAtt !== a) changed = true;
                  return migratedAtt;
                })
              )
            : m.attachments;

          const cleanedAttachments = updatedAttachments
            ? updatedAttachments.map((a) => (a.storage === "idb" && a.url.startsWith("blob:") ? { ...a, url: "" } : a))
            : updatedAttachments;

          const versions = m.versions
            ? await Promise.all(
                m.versions.map(async (v) => {
                  if (!v.attachments || v.attachments.length === 0) return v;
                  const updated = await Promise.all(
                    v.attachments.map(async (a) => {
                      if (remaining <= 0) return a;
                      if (!a.url || !a.url.startsWith("data:")) return a;
                      if (a.storage === "idb") return { ...a, url: "" };
                      if (a.url.length < 256 * 1024) return a;
                      remaining -= 1;
                      const migratedAtt = await migrateInlineAttachmentToIdb(a);
                      if (migratedAtt !== a) changed = true;
                      return migratedAtt;
                    })
                  );
                  const cleaned = updated.map((a) => (a.storage === "idb" && a.url.startsWith("blob:") ? { ...a, url: "" } : a));
                  if (cleaned !== v.attachments) changed = true;
                  return { ...v, attachments: cleaned };
                })
              )
            : m.versions;

          if (cleanedAttachments !== m.attachments || versions !== m.versions) changed = true;
          if (changed) {
            didChange = true;
            convChanged = true;
          }
          return changed ? { ...m, attachments: cleanedAttachments, versions } : m;
        })
      );

      return convChanged ? { ...conv, messages: updatedMessages } : conv;
    })
  );

  return didChange ? migrated : conversations;
}

/** Load all conversations from IndexedDB and localStorage, merging both */
export async function loadConversations(): Promise<Conversation[]> {
  const loadTimer = startTimer();
  try {
    const mergedMap = new Map<string, Conversation>();

    // 1. localStorage (fast, synchronous-ish)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const conv = normalizeConversation(item);
            if (conv) mergedMap.set(conv.id, conv);
          }
        }
      }
    } catch {
      // Ignore parse errors or root storage access errors
    }

    // Also check legacy keys
    for (const legacyKey of ["dalam-conversations", "chat-conversations"]) {
      try {
        const raw = localStorage.getItem(legacyKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const conv = normalizeConversation(item);
              if (!conv) continue;
              const existing = mergedMap.get(conv.id);
              if (!existing || isConversationRicher(conv, existing)) {
                mergedMap.set(conv.id, conv);
              }
            }
          }
          localStorage.removeItem(legacyKey); // clean up
        }
      } catch {
        // Ignore legacy key read/parse errors
      }
    }

    // 2. IndexedDB (richer, async) — overwrite localStorage entries if IDB has more messages
    try {
      const idbConversations = await dalamDB.getAllConversations();
      for (const idbItem of idbConversations) {
        const conv = normalizeConversation(idbItem);
        if (!conv) continue;
        const existing = mergedMap.get(conv.id);
        if (!existing || isConversationRicher(conv, existing)) {
          mergedMap.set(conv.id, conv);
        }
      }
    } catch (err) {
      console.warn("IndexedDB load failed, using localStorage only:", err);
    }

    const mergedConversations = Array.from(mergedMap.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const finalConversations = await migrateConversationAttachments(mergedConversations, 25);

    // Sync merged result back to both stores
    saveToLocalStorage(finalConversations);
    
    // Async IDB sync (non-blocking)
    Promise.allSettled(
      finalConversations.map(conv =>
        dalamDB.saveConversation({
          ...conv,
          createdAt: conv.createdAt.getTime(),
          lastModified: Date.now(),
        })
      )
    ).catch(() => {});

    recordTelemetry("load", loadTimer(), { conversations: finalConversations.length });
    return finalConversations;
  } catch (err) {
    console.warn("Failed to load conversations:", err);
    return [];
  }
}

/** Save conversations to both localStorage and IndexedDB */
export async function persistConversations(conversations: Conversation[]) {
  if (typeof window === "undefined") return;
  const saveTimer = startTimer();
  // Save FULL conversations to localStorage for refresh resilience
  saveToLocalStorage(conversations);

  const prepared = await migrateConversationAttachments(conversations, 6);

  // Save to IndexedDB in parallel
  await Promise.allSettled(
    prepared.map(conv =>
      dalamDB.saveConversation({
        ...conv,
        createdAt: conv.createdAt.getTime(),
        lastModified: Date.now(),
      })
    )
  );

  recordTelemetry("save", saveTimer(), { conversations: prepared.length });
}

/** Delete a conversation from both stores */
export async function deleteConversationFromLocalDB(id: string) {
  try {
    await dalamDB.deleteConversation(id);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.filter((c: Conversation) => c.id !== id)));
        }
      }
    } catch {
      // LocalStorage update after IDB delete failed
    }
  } catch (err) {
    console.warn("Failed to delete conversation:", err);
  }
}

/**
 * Hook that auto-saves conversations to local storage when they change.
 */
export function useChatPersistence(
  conversations: Conversation[],
  isStreaming: boolean,
  hasLoaded: boolean = true
) {
  const lastSerializedRef = useRef<string>("");
  const saveInFlightRef = useRef(false);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;

  const scheduleIdle = (cb: () => void) => {
    if (typeof window === "undefined") return;
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(cb, { timeout: 1500 });
      return;
    }
    setTimeout(cb, 0);
  };

  // Auto-save when not streaming
  useEffect(() => {
    if (isStreaming || !hasLoaded || conversations.length === 0) return;

    const saveIfChanged = (convs: Conversation[]) => {
      if (!hasLoadedRef.current || !convs || convs.length === 0) return;
      if (saveInFlightRef.current) return;
      try {
        scheduleIdle(() => {
          if (!hasLoadedRef.current) return;
          if (saveInFlightRef.current) return;
          try {
            const serialized = JSON.stringify(convs);
            if (serialized === lastSerializedRef.current) return;
            lastSerializedRef.current = serialized;
            saveInFlightRef.current = true;
            Promise.resolve(persistConversations(convs))
              .catch(() => undefined)
              .finally(() => {
                saveInFlightRef.current = false;
              });
          } catch (err) {
            console.warn("Failed to serialize conversations:", err);
          }
        });
      } catch (err) {
        console.warn("Failed to serialize conversations:", err);
      }
    };

    // Save immediately for fresh chats (first 2 messages), delay otherwise.
    const isFreshChat = conversations.some(c => c.messages.length > 0 && c.messages.length <= 2);
    if (isFreshChat) {
      saveIfChanged(conversations);
      return;
    }

    const timeoutId = setTimeout(() => saveIfChanged(conversations), 1500);
    return () => clearTimeout(timeoutId);
  }, [conversations, isStreaming, hasLoaded]);

  // Force-save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasLoadedRef.current) return;
      const convs = conversationsRef.current;
      if (!convs || convs.length === 0) return;
      saveToLocalStorage(convs);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}

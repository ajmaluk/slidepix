/**
 * Lightweight IndexedDB wrapper for large data storage.
 * 
 * Manages persistent storage for:
 * 1. Conversations (beyond localStorage limits)
 * 2. Attachment blobs and data URLs
 * 3. AI Agent interactions and global memory
 * 4. Extracted knowledge and user preferences
 */

import type { Message } from "./chat";

const DB_NAME = "dalam_db";
const DB_VERSION = 8;

export interface IDBConversation {
  id: string;
  shortId?: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastModified: number;
}

export interface IDBOCRResult {
  attachmentId: string;
  conversationId?: string;
  status: "pending" | "scanning" | "success" | "failed";
  extractedText: string;
  structuredData: string;
  metadata: string;
  isLargeDoc?: boolean;
  model?: string;
  version: number;
  timestamp: number;
}

export interface IDBOCRResultHistoryEntry extends IDBOCRResult {
  id: string;
}

export interface IDBReminder {
  id: string;
  conversationId: string;
  userId?: string;
  text: string;
  dueAt: number;
  status: "pending" | "done" | "dismissed";
  createdAt: number;
  sourceMessageId?: string;
}

/**
 * Represents a single AI-user interaction for global context retrieval.
 */
export interface IDBInteraction {
  id: string;
  agentId: string;
  query: string;
  answer?: string;
  role: string;
  timestamp: number;
  [key: string]: any;
}

/**
 * Represents a piece of technical or personal knowledge extracted from chat.
 */
export interface IDBKnowledge {
  id: string;
  agentId: string;
  topic: string;
  content: string;
  source: string;
  timestamp: number;
}

/**
 * Represents an inferred or explicit user preference.
 */
export interface IDBPreference {
  id: string;
  category: string;
  preference: string;
  timestamp: number;
}

export interface IDBGeneratedImage {
  id: string;
  prompt: string;
  image_url: string;
  provider: string;
  model: string | null;
  is_edit: boolean;
  tags: string[];
  created_at: string;
}

export interface IDBFinalMessage {
  id: string;
  content: string;
  timestamp: number;
}

/**
 * Core database service for the Dalam AI application.
 */
export class DalamDB {
  private db: IDBDatabase | null = null;

  /**
   * Initializes the database and creates object stores if they don't exist.
   */
  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("attachments")) {
          db.createObjectStore("attachments", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("interactions")) {
          const interactionStore = db.createObjectStore("interactions", { keyPath: "id" });
          interactionStore.createIndex("timestamp", "timestamp", { unique: false });
          interactionStore.createIndex("agentId", "agentId", { unique: false });
          interactionStore.createIndex("query", "query", { unique: false });
          interactionStore.createIndex("importance", "importance", { unique: false });
        }
        if (!db.objectStoreNames.contains("knowledge")) {
          const knowledgeStore = db.createObjectStore("knowledge", { keyPath: "id" });
          knowledgeStore.createIndex("topic", "topic", { unique: false });
          knowledgeStore.createIndex("content", "content", { unique: false });
          knowledgeStore.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains("preferences")) {
          db.createObjectStore("preferences", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("ocrResults")) {
          db.createObjectStore("ocrResults", { keyPath: "attachmentId" });
        }
        if (!db.objectStoreNames.contains("ocrResultHistory")) {
          const historyStore = db.createObjectStore("ocrResultHistory", { keyPath: "id" });
          historyStore.createIndex("attachmentId", "attachmentId", { unique: false });
          historyStore.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains("reminders")) {
          db.createObjectStore("reminders", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("knowledgeIndex")) {
          const indexStore = db.createObjectStore("knowledgeIndex", { keyPath: "id" });
          indexStore.createIndex("keyword", "keyword", { unique: false });
          indexStore.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains("generatedImages")) {
          const imgStore = db.createObjectStore("generatedImages", { keyPath: "id" });
          imgStore.createIndex("created_at", "created_at", { unique: false });
        }
        if (!db.objectStoreNames.contains("finalMessages")) {
          const finalStore = db.createObjectStore("finalMessages", { keyPath: "id" });
          finalStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event: Event) => {
        console.error("IndexedDB error:", (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // ... (existing conversation methods)

  async saveInteraction(interaction: IDBInteraction): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["interactions"], "readwrite");
      const store = transaction.objectStore("interactions");
      const request = store.put(interaction);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllInteractions(): Promise<IDBInteraction[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["interactions"], "readonly");
      const store = transaction.objectStore("interactions");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveKnowledge(item: IDBKnowledge): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["knowledge"], "readwrite");
      const store = transaction.objectStore("knowledge");
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllKnowledge(): Promise<IDBKnowledge[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["knowledge"], "readonly");
      const store = transaction.objectStore("knowledge");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async savePreference(pref: IDBPreference): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["preferences"], "readwrite");
      const store = transaction.objectStore("preferences");
      const request = store.put(pref);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPreferences(): Promise<IDBPreference[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["preferences"], "readonly");
      const store = transaction.objectStore("preferences");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveConversation(conv: IDBConversation): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readwrite");
      const store = transaction.objectStore("conversations");
      const request = store.put(conv);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getConversation(id: string): Promise<IDBConversation | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readonly");
      const store = transaction.objectStore("conversations");
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getConversationByShortId(shortId: string): Promise<IDBConversation | null> {
    await this.init();
    const all = await this.getAllConversations();
    return all.find((conv) => conv.shortId === shortId) || null;
  }

  async getAllConversations(): Promise<IDBConversation[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readonly");
      const store = transaction.objectStore("conversations");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readwrite");
      const store = transaction.objectStore("conversations");
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveAttachment(id: string, dataUrl: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["attachments"], "readwrite");
      const store = transaction.objectStore("attachments");
      const request = store.put({ id, dataUrl, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveAttachmentBlob(id: string, blob: Blob, meta?: { type?: string; name?: string; size?: number }): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["attachments"], "readwrite");
      const store = transaction.objectStore("attachments");
      const request = store.put({
        id,
        blob,
        type: meta?.type,
        name: meta?.name,
        size: meta?.size,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAttachment(id: string): Promise<string | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["attachments"], "readonly");
      const store = transaction.objectStore("attachments");
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result?.dataUrl || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAttachmentBlob(id: string): Promise<Blob | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["attachments"], "readonly");
      const store = transaction.objectStore("attachments");
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result?.blob || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveOCRResult(result: IDBOCRResult): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["ocrResults"], "readwrite");
      const store = transaction.objectStore("ocrResults");
      const request = store.put(result);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOCRResult(attachmentId: string): Promise<IDBOCRResult | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["ocrResults"], "readonly");
      const store = transaction.objectStore("ocrResults");
      const request = store.get(attachmentId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveOCRResultHistoryEntry(entry: IDBOCRResultHistoryEntry): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["ocrResultHistory"], "readwrite");
      const store = transaction.objectStore("ocrResultHistory");
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOCRResultHistory(attachmentId: string, limit = 10): Promise<IDBOCRResultHistoryEntry[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["ocrResultHistory"], "readonly");
      const store = transaction.objectStore("ocrResultHistory");
      const index = store.index("attachmentId");
      const request = index.getAll(IDBKeyRange.only(attachmentId));

      request.onsuccess = () => {
        const rows = (request.result || [])
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(rows);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveReminder(reminder: IDBReminder): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["reminders"], "readwrite");
      const store = transaction.objectStore("reminders");
      const request = store.put(reminder);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllReminders(): Promise<IDBReminder[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["reminders"], "readonly");
      const store = transaction.objectStore("reminders");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateReminderStatus(id: string, status: IDBReminder["status"]): Promise<void> {
    await this.init();
    const reminders = await this.getAllReminders();
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;
    await this.saveReminder({ ...reminder, status });
  }

  async saveKnowledgeIndex(keyword: string, factId: string, metadata?: Record<string, any>): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["knowledgeIndex"], "readwrite");
      const store = transaction.objectStore("knowledgeIndex");
      const request = store.put({
        id: `${keyword.toLowerCase()}_${factId}`,
        keyword: keyword.toLowerCase(),
        factId,
        timestamp: Date.now(),
        metadata,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async searchKnowledgeByKeyword(keyword: string): Promise<string[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["knowledgeIndex"], "readonly");
      const store = transaction.objectStore("knowledgeIndex");
      const index = store.index("keyword");
      const request = index.getAll(IDBKeyRange.only(keyword.toLowerCase()));
      request.onsuccess = () => resolve(request.result.map(r => r.factId));
      request.onerror = () => reject(request.error);
    });
  }

  async clearKnowledgeIndex(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["knowledgeIndex"], "readwrite");
      const store = transaction.objectStore("knowledgeIndex");
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getInteractionByImportance(minImportance: number): Promise<IDBInteraction[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["interactions"], "readonly");
      const store = transaction.objectStore("interactions");
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result || [])
          .filter(i => (i.importance || 0) >= minImportance)
          .sort((a, b) => (b.importance || 0) - (a.importance || 0));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ── Generated Images (local storage) ──

  async saveGeneratedImage(img: IDBGeneratedImage): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["generatedImages"], "readwrite");
      const store = tx.objectStore("generatedImages");
      const request = store.put(img);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllGeneratedImages(): Promise<IDBGeneratedImage[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["generatedImages"], "readonly");
      const store = tx.objectStore("generatedImages");
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result || []).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteGeneratedImage(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["generatedImages"], "readwrite");
      const store = tx.objectStore("generatedImages");
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ── Final Messages (typing pre-save) ──

  async saveFinalMessage(entry: IDBFinalMessage): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["finalMessages"], "readwrite");
      const store = tx.objectStore("finalMessages");
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getFinalMessage(id: string): Promise<IDBFinalMessage | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["finalMessages"], "readonly");
      const store = tx.objectStore("finalMessages");
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFinalMessage(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(["finalMessages"], "readwrite");
      const store = tx.objectStore("finalMessages");
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const dalamDB = new DalamDB();

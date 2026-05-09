import type { Conversation, Message } from "@/lib/chat";
import { generateId } from "@/lib/chat";
import { dalamDB, type IDBReminder } from "@/lib/indexedDB";

export interface TemporalStatement {
  conversationId: string;
  messageId: string;
  content: string;
  timestamp: Date;
  timezone?: string;
}

export function indexTemporalStatements(conversations: Conversation[]): TemporalStatement[] {
  const out: TemporalStatement[] = [];
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== "user") continue;
      out.push({
        conversationId: conv.id,
        messageId: msg.id,
        content: msg.content,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
        timezone: msg.timestampTimezone,
      });
    }
  }
  return out.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function getWindowMs(query: string): number {
  const q = query.toLowerCase();
  if (q.includes("today")) return 24 * 60 * 60 * 1000;
  if (q.includes("yesterday")) return 2 * 24 * 60 * 60 * 1000;
  if (q.includes("last week") || q.includes("this week")) return 7 * 24 * 60 * 60 * 1000;
  if (q.includes("last month") || q.includes("this month")) return 31 * 24 * 60 * 60 * 1000;
  return 365 * 24 * 60 * 60 * 1000;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function searchTemporalStatements(
  statements: TemporalStatement[],
  query: string,
  now: Date = new Date(),
  limit = 5
): TemporalStatement[] {
  const queryTokens = new Set(tokenize(query));
  const maxAge = getWindowMs(query);

  return statements
    .filter((s) => now.getTime() - s.timestamp.getTime() <= maxAge)
    .map((s) => {
      const contentTokens = tokenize(s.content);
      let overlap = 0;
      for (const token of contentTokens) {
        if (queryTokens.has(token)) overlap += 1;
      }
      return { statement: s, score: overlap + (1 / (1 + (now.getTime() - s.timestamp.getTime()) / (24 * 60 * 60 * 1000))) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.statement);
}

export function buildTemporalContextSnippet(statements: TemporalStatement[], query: string): string {
  const hits = searchTemporalStatements(statements, query);
  if (hits.length === 0) return "";

  const lines = hits.map((hit) => {
    const ts = hit.timestamp.toISOString();
    return `- ${hit.content.slice(0, 180)} (said at ${ts}${hit.timezone ? ` ${hit.timezone}` : ""})`;
  });

  return [
    "[Temporal Memory Retrieval]",
    ...lines,
  ].join("\n");
}

export async function createReminder(input: {
  conversationId: string;
  text: string;
  dueAt: Date;
  userId?: string;
  sourceMessageId?: string;
}): Promise<IDBReminder> {
  const reminder: IDBReminder = {
    id: generateId(),
    conversationId: input.conversationId,
    userId: input.userId,
    text: input.text,
    dueAt: input.dueAt.getTime(),
    status: "pending",
    createdAt: Date.now(),
    sourceMessageId: input.sourceMessageId,
  };
  await dalamDB.saveReminder(reminder);
  return reminder;
}

export async function getDueReminders(now: Date = new Date()): Promise<IDBReminder[]> {
  const all = await dalamDB.getAllReminders();
  return all
    .filter((r) => r.status === "pending" && r.dueAt <= now.getTime())
    .sort((a, b) => a.dueAt - b.dueAt);
}

export async function completeReminder(id: string): Promise<void> {
  await dalamDB.updateReminderStatus(id, "done");
}

export async function dismissReminder(id: string): Promise<void> {
  await dalamDB.updateReminderStatus(id, "dismissed");
}

export function looksLikeTemporalQuery(query: string): boolean {
  return /\b(when did i|last week|yesterday|today|last month|remind me|when was)\b/i.test(query);
}

export interface AutoReminderSuggestion {
  text: string;
  dueAt: Date;
  trigger: string;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeTaskText(raw: string): string {
  return raw
    .replace(/\b(?:tomorrow|tonight|next\s+week|next\s+month|weekend|after\s+work|this\s+(?:morning|afternoon|evening)|around\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|evening|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b[\s\S]*$/i, "")
    .replace(/\b(?:please|maybe|later)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setClock(date: Date, hours: number, minutes = 0): Date {
  const out = new Date(date);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

function hasDateHint(text: string): boolean {
  return /\b(tomorrow|today|next\s+month|next\s+week|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b/i.test(text);
}

function normalizeReminderInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/\bpls\b|\bplz\b/g, "please")
    .replace(/\bnxt\b/g, "next")
    .replace(/\btmrw\b|\btomrw\b|\btmr\b/g, "tomorrow")
    .replace(/\bwknd\b/g, "weekend")
    .replace(/\beve\b/g, "evening")
    .replace(/\bmrng\b/g, "morning")
    .replace(/\bremndr\b|\brmndr\b|\bremindr\b/g, "reminder")
    .replace(/\bdont\b/g, "don't")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClockHint(text: string): { hours: number; minutes: number } | null {
  const m = text.match(/\b(?:at|around)?\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (m) {
    const hRaw = Number(m[1]);
    const mins = Number(m[2] ?? "0");
    const ampm = (m[3] || "").toLowerCase();
    const base = hRaw % 12;
    const hours = ampm === "pm" ? base + 12 : base;
    return { hours, minutes: mins };
  }

  const m24 = text.match(/\b(?:at|around)?\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m24) return null;

  return { hours: Number(m24[1]), minutes: Number(m24[2]) };
}

function getNextWeekday(now: Date, targetWeekday: number): Date {
  const out = new Date(now);
  const diff = (targetWeekday - out.getDay() + 7) % 7 || 7;
  out.setDate(out.getDate() + diff);
  return out;
}

function getFirstWeekdayOfNextMonth(now: Date, targetWeekday: number): Date {
  const out = new Date(now);
  out.setMonth(out.getMonth() + 1, 1);
  const diff = (targetWeekday - out.getDay() + 7) % 7;
  out.setDate(out.getDate() + diff);
  return out;
}

function extractTaskFromText(text: string): { task: string; trigger: string } | null {
  const extractionPatterns: Array<{ regex: RegExp; trigger: string }> = [
    { regex: /\bremind me to\s+(.+)/i, trigger: "remind-me" },
    { regex: /\bremind me about\s+(.+)/i, trigger: "remind-me-about" },
    { regex: /\bset (?:a\s+)?reminder to\s+(.+)/i, trigger: "set-reminder-to" },
    { regex: /\bset (?:a\s+)?reminder for\s+(.+)/i, trigger: "set-reminder-for" },
    { regex: /\bcan you remind me to\s+(.+)/i, trigger: "can-you-remind" },
    { regex: /\bremember to\s+(.+)/i, trigger: "remember-to" },
    { regex: /\bdon't let me forget to\s+(.+)/i, trigger: "dont-forget" },
    { regex: /\bdo not let me forget to\s+(.+)/i, trigger: "dont-forget" },
    { regex: /\bi\s+(?:want|need|have|plan|am going|gonna|will|should)\s+to\s+(.+)/i, trigger: "future-intent" },
    { regex: /\bi\s+gotta\s+(.+)/i, trigger: "future-intent" },
  ];

  for (const pattern of extractionPatterns) {
    const match = text.match(pattern.regex);
    if (!match?.[1]) continue;
    const candidate = normalizeTaskText(match[1]);
    if (!candidate || candidate.length < 3) continue;
    return { task: candidate, trigger: pattern.trigger };
  }
  return null;
}

function isVagueTask(task: string): boolean {
  const normalized = task.replace(/[^a-z\s]/gi, "").trim().toLowerCase();
  return /^(that|this|it|that one|this one)$/.test(normalized);
}

function inferDueAt(text: string, now: Date): Date | null {
  const lower = text.toLowerCase();
  let base = new Date(now);

  const explicitTime = parseClockHint(lower);
  const hasWeekdayHint = Object.keys(WEEKDAY_TO_INDEX).some((day) => lower.includes(day)) || lower.includes("weekend");
  const hasTodayHint = /\b(today|tonight|this\s+morning|this\s+afternoon|this\s+evening)\b/i.test(lower);

  // Date anchor first
  if (lower.includes("next month")) {
    const weekday = Object.entries(WEEKDAY_TO_INDEX).find(([day]) => lower.includes(day))?.[1];
    if (typeof weekday === "number") {
      base = getFirstWeekdayOfNextMonth(now, weekday);
    } else {
      base = new Date(now);
      base.setMonth(base.getMonth() + 1, 1);
    }
  } else if (lower.includes("weekend")) {
    const saturday = getNextWeekday(now, WEEKDAY_TO_INDEX.saturday);
    base = saturday;
  } else if (lower.includes("next week")) {
    base = new Date(now);
    base.setDate(base.getDate() + 7);
  } else if (lower.includes("tomorrow")) {
    base = new Date(now);
    base.setDate(base.getDate() + 1);
  } else {
    const weekday = Object.entries(WEEKDAY_TO_INDEX).find(([day]) => lower.includes(day))?.[1];
    if (typeof weekday === "number") {
      base = getNextWeekday(now, weekday);
    }
  }

  // Time preference second
  let due = new Date(base);
  if (explicitTime) {
    due = setClock(due, explicitTime.hours, explicitTime.minutes);
  } else if (lower.includes("after work")) {
    due = setClock(due, 18, 30);
  } else if (lower.includes("morning")) {
    due = setClock(due, 9, 0);
  } else if (lower.includes("afternoon")) {
    due = setClock(due, 15, 0);
  } else if (lower.includes("evening") || lower.includes("tonight")) {
    due = setClock(due, 18, 0);
  } else if (hasDateHint(lower)) {
    due = setClock(due, 9, 0);
  } else {
    return null;
  }

  // If still in the past and no explicit date anchor, move to next day.
  const anchoredDate = hasDateHint(lower);
  if (!anchoredDate && due.getTime() <= now.getTime()) {
    due.setDate(due.getDate() + 1);
  }

  // Keep the reminder in the future with phrase-aware nudges.
  if (due.getTime() <= now.getTime()) {
    if (hasTodayHint) {
      due.setDate(due.getDate() + 1);
    } else if (lower.includes("next month")) {
      due.setMonth(due.getMonth() + 1);
    } else if (hasWeekdayHint || lower.includes("next week")) {
      due.setDate(due.getDate() + 7);
    } else {
      due.setDate(due.getDate() + 1);
    }
  }

  return due;
}

export function parseAutoReminderSuggestion(
  input: string,
  now: Date = new Date(),
  recentUserMessages: string[] = []
): AutoReminderSuggestion | null {
  const text = input.trim();
  if (!text) return null;

  const lower = normalizeReminderInput(text);
  const hasTimeHint = /\b(morning|afternoon|evening|tonight|tomorrow|after work|around\s+\d{1,2}(?::\d{2})?\s*(am|pm)?|\d{1,2}(?::\d{2})?\s*(am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i.test(lower);
  const hasDateOnlyHint = hasDateHint(lower);
  if (!hasTimeHint && !hasDateOnlyHint) return null;

  const explicitReminder = /\b(remind me|set a reminder|set reminder|add reminder|can you set a reminder|can you remind me|reminder|don't let me forget|do not let me forget|remember to|ping me)\b/i.test(lower);
  const futureIntent = /\b(i\s+(want|need|have|plan|am going|gonna|will|should)\s+to|i\s+gotta)\b/i.test(lower);
  if (!explicitReminder && !futureIntent) return null;

  const dueAt = inferDueAt(lower, now);
  if (!dueAt) return null;

  const directTask = extractTaskFromText(lower);
  if (directTask && !isVagueTask(directTask.task)) {
    return {
      text: directTask.task,
      dueAt,
      trigger: directTask.trigger,
    };
  }

  // Contextual follow-up: "can you set a reminder on evening" after earlier intent.
  if (explicitReminder && recentUserMessages.length > 0) {
    for (let i = recentUserMessages.length - 1; i >= 0; i -= 1) {
      const historical = extractTaskFromText(normalizeReminderInput(recentUserMessages[i]));
      if (!historical) continue;
      return {
        text: historical.task,
        dueAt,
        trigger: "context-followup",
      };
    }
  }

  return null;
}

export function findMessageById(conversations: Conversation[], messageId: string): Message | null {
  for (const conv of conversations) {
    const found = conv.messages.find((m) => m.id === messageId);
    if (found) return found;
  }
  return null;
}

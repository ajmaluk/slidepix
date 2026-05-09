/**
 * Structured logging utility for Dalam.
 * Provides consistent log format with severity levels, context, and persistence.
 */

import { isDev } from "./env";
import { trackEvent } from "./telemetry";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const MIN_LEVEL: LogLevel = isDev() ? "debug" : "warn";
const MAX_PERSISTED_ERRORS = 20;
const ERROR_STORAGE_KEY = "dalam_error_log";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.level.toUpperCase()}][${entry.module}]`;
  return `${prefix} ${entry.message}`;
}

function persistError(entry: LogEntry): void {
  if (LOG_LEVELS[entry.level] < LOG_LEVELS.error) return;
  
  // Send to centralized analytics
  trackEvent("exception", {
    fatal: entry.level === "fatal",
    module: entry.module.slice(0, 32),
  });

  try {
    const existing = JSON.parse(localStorage.getItem(ERROR_STORAGE_KEY) || "[]");
    existing.unshift({
      ...entry,
      url: window.location.pathname,
    });
    localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(existing.slice(0, MAX_PERSISTED_ERRORS)));
  } catch {
    // Ignore storage failures
  }
}

function createEntry(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>,
  error?: unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    data,
  };

  if (error instanceof Error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
    };
  } else if (error) {
    entry.error = {
      name: "UnknownError",
      message: String(error),
    };
  }

  return entry;
}

/**
 * Create a scoped logger for a specific module.
 */
export function createLogger(module: string) {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (!shouldLog("debug")) return;
      const entry = createEntry("debug", module, message, data);
      console.debug(formatEntry(entry), data || "");
    },

    info(message: string, data?: Record<string, unknown>) {
      if (!shouldLog("info")) return;
      const entry = createEntry("info", module, message, data);
      console.info(formatEntry(entry), data || "");
    },

    warn(message: string, data?: Record<string, unknown>, error?: unknown) {
      if (!shouldLog("warn")) return;
      const entry = createEntry("warn", module, message, data, error);
      console.warn(formatEntry(entry), data || "", error || "");
    },

    error(message: string, error?: unknown, data?: Record<string, unknown>) {
      if (!shouldLog("error")) return;
      const entry = createEntry("error", module, message, data, error);
      console.error(formatEntry(entry), error || "", data || "");
      persistError(entry);
    },

    fatal(message: string, error?: unknown, data?: Record<string, unknown>) {
      const entry = createEntry("fatal", module, message, data, error);
      console.error(`🔴 ${formatEntry(entry)}`, error || "", data || "");
      persistError(entry);
    },
  };
}

/**
 * Retrieve persisted error logs for debugging.
 */
export function getPersistedErrors(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(ERROR_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Clear persisted error logs.
 */
export function clearPersistedErrors(): void {
  try {
    localStorage.removeItem(ERROR_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

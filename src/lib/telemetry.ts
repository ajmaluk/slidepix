import { firebaseAnalytics } from "@/lib/firebaseClient";
import { logEvent } from "firebase/analytics";
import { isDev } from "./env";

/**
 * Lightweight chat performance telemetry
 * Tracks first-token latency, total response time, and save/load durations.
 * Data stored in-memory with optional console output for debugging.
 */

export interface TelemetryEntry {
  id: string;
  timestamp: number;
  type: "first-token" | "total-response" | "save" | "load";
  durationMs: number;
  metadata?: Record<string, string | number>;
}

const MAX_ENTRIES = 100;
const entries: TelemetryEntry[] = [];
let enabled = true;

export function setTelemetryEnabled(value: boolean) {
  enabled = value;
}

export async function trackEvent(eventName: string, params?: Record<string, any>) {
  try {
    const analytics = await firebaseAnalytics;
    if (analytics) {
      logEvent(analytics, eventName, sanitizeAnalyticsParams(params));
    }
  } catch (err) {
    console.debug("Failed to log event:", err);
  }
}

function sanitizeAnalyticsParams(params?: Record<string, any>): Record<string, string | number> | undefined {
  if (!params) return undefined;

  const allowed: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      allowed[key] = value.slice(0, 64);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      allowed[key] = Math.round(value * 100) / 100;
    }
  }

  return Object.keys(allowed).length > 0 ? allowed : undefined;
}

export function recordTelemetry(
  type: TelemetryEntry["type"],
  durationMs: number,
  metadata?: Record<string, string | number>
) {
  if (!enabled) return;

  const entry: TelemetryEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    durationMs: Math.round(durationMs * 100) / 100,
    metadata,
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  // Debug output in dev mode
  if (isDev()) {
    const label = type === "first-token" ? "⚡ First Token" :
                  type === "total-response" ? "✅ Total Response" :
                  type === "save" ? "💾 Save" : "📂 Load";
    console.debug(`[Telemetry] ${label}: ${entry.durationMs}ms`, metadata || "");
  }

  // Send to Firebase Analytics
  trackEvent("performance_metric", {
    metric_type: type,
    duration_ms: entry.durationMs,
  });
}

export function getTelemetryEntries(): TelemetryEntry[] {
  return [...entries];
}

export function getTelemetrySummary(): {
  avgFirstToken: number;
  avgTotalResponse: number;
  avgSave: number;
  avgLoad: number;
  count: number;
} {
  const byType = (t: TelemetryEntry["type"]) => entries.filter(e => e.type === t);
  const avg = (arr: TelemetryEntry[]) => arr.length > 0
    ? Math.round(arr.reduce((sum, e) => sum + e.durationMs, 0) / arr.length)
    : 0;

  return {
    avgFirstToken: avg(byType("first-token")),
    avgTotalResponse: avg(byType("total-response")),
    avgSave: avg(byType("save")),
    avgLoad: avg(byType("load")),
    count: entries.length,
  };
}

export function clearTelemetry() {
  entries.length = 0;
}

/** Timer helper for easy start/stop measurement */
export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

const DEFAULT_PUBLIC_API_BASE_URL = "/v1/api";
const DEFAULT_LEGACY_FUNCTIONS_BASE_URL = "/functions/v1";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function hasHttpProtocol(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolvePathBase(raw: string): string {
  const normalized = trimTrailingSlash(raw);
  if (!normalized) {
    return getPublicApiBaseUrl();
  }

  if (normalized.endsWith(DEFAULT_PUBLIC_API_BASE_URL) || normalized.endsWith(DEFAULT_LEGACY_FUNCTIONS_BASE_URL)) {
    return normalized;
  }

  if (/\.supabase\.co$/i.test(normalized)) {
    return `${normalized}${DEFAULT_LEGACY_FUNCTIONS_BASE_URL}`;
  }

  if (hasHttpProtocol(normalized) || normalized.startsWith("/")) {
    return `${normalized}${DEFAULT_PUBLIC_API_BASE_URL}`;
  }

  return normalized;
}

export function getPublicApiBaseUrl(): string {
  return DEFAULT_PUBLIC_API_BASE_URL;
}

import { getEnv } from "./env";

/**
 * Resolves the backend function base URL from env with safe fallbacks.
 * Supports both legacy `/functions/v1` and new `/v1/api` deployments.
 */
export function resolveEdgeFunctionsBaseUrl(): string {
  const raw = getEnv("VITE_EDGE_FUNCTIONS_BASE_URL") || "";

  if (!raw) {
    return getPublicApiBaseUrl();
  }

  return resolvePathBase(raw);
}

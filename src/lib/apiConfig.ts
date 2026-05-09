const DEFAULT_PUBLIC_API_BASE_URL = "/v1/api";

export function getPublicApiBaseUrl(): string {
  return DEFAULT_PUBLIC_API_BASE_URL;
}

/**
 * Resolves the backend function base URL.
 *
 * The app now uses the Cloudflare-compatible public API prefix directly,
 * so this stays deterministic instead of depending on an env toggle.
 */
export function resolveEdgeFunctionsBaseUrl(): string {
  return getPublicApiBaseUrl();
}

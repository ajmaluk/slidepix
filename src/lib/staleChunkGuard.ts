const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
  /Failed to load module script/i,
  /MIME type .*text\/html/i,
  /importing a module script failed/i,
];

const PROMPT_DEBOUNCE_MS = 2 * 60 * 1000;
const PROMPT_STORAGE_KEY = "dalam:stale-chunk-prompted-at";

let hasPromptedThisSession = false;

function toErrorText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message} ${value.stack ?? ""}`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isStaleChunkLikeError(input: unknown): boolean {
  const text = toErrorText(input);
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(text));
}

function shouldPromptNow(): boolean {
  if (hasPromptedThisSession) return false;

  try {
    const lastPrompt = Number(window.sessionStorage.getItem(PROMPT_STORAGE_KEY) || "0");
    if (Date.now() - lastPrompt < PROMPT_DEBOUNCE_MS) {
      return false;
    }
  } catch {
    // sessionStorage may be unavailable in restricted environments.
  }

  hasPromptedThisSession = true;
  try {
    window.sessionStorage.setItem(PROMPT_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage write failures.
  }
  return true;
}

function promptForRefresh() {
  if (!shouldPromptNow()) return;

  const shouldReload = window.confirm(
    "A new version of Dalam is available and this tab has stale files. Refresh now to continue without errors."
  );

  if (shouldReload) {
    window.location.reload();
  }
}

export function installStaleChunkGuard() {
  if (!import.meta.env.PROD) return;

  window.addEventListener("error", (event) => {
    const details = [event.message, event.error, event.filename].filter(Boolean).join("\n");
    if (isStaleChunkLikeError(details)) {
      promptForRefresh();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!isStaleChunkLikeError(event.reason)) return;
    event.preventDefault();
    promptForRefresh();
  });
}

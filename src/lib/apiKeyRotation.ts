import { getEnv } from "./env";

/**
 * API Key Rotation Utility
 * 
 * Provides client-side key rotation for multi-key providers.
 * Keys are rotated round-robin with failure tracking to skip broken keys.
 * 
 * SECURITY NOTE: Client-side API keys should be considered semi-public.
 * For production, route calls through a server-side proxy (Firebase Functions).
 * This utility adds resilience, not security.
 */

interface KeyState {
  key: string;
  failureCount: number;
  lastFailure: number;
  cooldownUntil: number;
}

interface RotationConfig {
  /** Max failures before a key enters cooldown */
  maxFailures: number;
  /** Cooldown duration in ms after max failures */
  cooldownMs: number;
  /** Reset failure count after this many ms of no failures */
  recoveryMs: number;
}

const DEFAULT_CONFIG: RotationConfig = {
  maxFailures: 3,
  cooldownMs: 60_000,     // 1 minute cooldown
  recoveryMs: 300_000,    // 5 minute recovery window
};

class ApiKeyRotator {
  private states: Map<string, KeyState[]> = new Map();
  private indices: Map<string, number> = new Map();
  private config: RotationConfig;

  constructor(config: Partial<RotationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register keys for a provider from a comma-separated env string.
   */
  registerFromEnv(provider: string, envValue: string | undefined): void {
    if (!envValue) return;
    const keys = envValue
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length === 0) return;

    this.states.set(
      provider,
      keys.map((key) => ({
        key,
        failureCount: 0,
        lastFailure: 0,
        cooldownUntil: 0,
      }))
    );
    this.indices.set(provider, 0);
  }

  /**
   * Get the next available key for a provider.
   * Skips keys in cooldown; returns null if all keys are exhausted.
   */
  getKey(provider: string): string | null {
    const states = this.states.get(provider);
    if (!states || states.length === 0) return null;

    const now = Date.now();
    let checked = 0;
    let idx = this.indices.get(provider) ?? 0;

    while (checked < states.length) {
      const state = states[idx % states.length];

      // Auto-recover from failures after recovery window
      if (state.failureCount > 0 && now - state.lastFailure > this.config.recoveryMs) {
        state.failureCount = 0;
        state.cooldownUntil = 0;
      }

      // Skip if in cooldown
      if (state.cooldownUntil > now) {
        idx++;
        checked++;
        continue;
      }

      this.indices.set(provider, (idx + 1) % states.length);
      return state.key;
    }

    // All keys in cooldown — return the one with earliest cooldown end
    const earliest = states.reduce((a, b) => (a.cooldownUntil < b.cooldownUntil ? a : b));
    return earliest.key;
  }

  /**
   * Report a failure for the given key. Tracks failures and applies cooldown.
   */
  reportFailure(provider: string, key: string): void {
    const states = this.states.get(provider);
    if (!states) return;

    const state = states.find((s) => s.key === key);
    if (!state) return;

    state.failureCount++;
    state.lastFailure = Date.now();

    if (state.failureCount >= this.config.maxFailures) {
      state.cooldownUntil = Date.now() + this.config.cooldownMs;
    }
  }

  /**
   * Report a success for the given key. Decrements failure count.
   */
  reportSuccess(provider: string, key: string): void {
    const states = this.states.get(provider);
    if (!states) return;

    const state = states.find((s) => s.key === key);
    if (!state) return;

    state.failureCount = Math.max(0, state.failureCount - 1);
    if (state.failureCount === 0) {
      state.cooldownUntil = 0;
    }
  }

  /**
   * Get health stats for a provider's keys.
   */
  getStats(provider: string): { total: number; healthy: number; cooldown: number } {
    const states = this.states.get(provider);
    if (!states) return { total: 0, healthy: 0, cooldown: 0 };

    const now = Date.now();
    const cooldown = states.filter((s) => s.cooldownUntil > now).length;
    return {
      total: states.length,
      healthy: states.length - cooldown,
      cooldown,
    };
  }
}

// Singleton instance
let _rotator: ApiKeyRotator | null = null;

export function getApiKeyRotator(): ApiKeyRotator {
  if (!_rotator) {
    _rotator = new ApiKeyRotator();

    // Auto-register multi-key providers from environment
    const multiKeyProviders: Record<string, string> = {
      gemini: "VITE_GEMINI_API_KEYS",
      groq: "VITE_GROQ_API_KEYS",
      nvidia: "VITE_NVIDIA_API_KEYS",
      openrouter: "VITE_OPENROUTER_API_KEYS",
    };

    for (const [provider, envKey] of Object.entries(multiKeyProviders)) {
      const value = getEnv(envKey);
      _rotator.registerFromEnv(provider, value);
    }
  }
  return _rotator;
}

export { ApiKeyRotator };
export type { RotationConfig };

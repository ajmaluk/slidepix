import { useSyncExternalStore } from "react";
import { authClient } from "@/lib/authClient";

type AuthSession = {
  user: {
    id: string;
    email: string | null;
    user_metadata: Record<string, unknown>;
  };
  access_token: string;
} | null;

type AuthState = {
  session: AuthSession;
  loading: boolean;
};

let authState: AuthState = {
  session: null,
  loading: true,
};

let initialized = false;
let initPromise: Promise<void> | null = null;
let unsubscribeAuth: (() => void) | null = null;
const listeners = new Set<() => void>();

function emitIfChanged(next: AuthState) {
  if (authState.session === next.session && authState.loading === next.loading) {
    return;
  }
  authState = next;
  listeners.forEach((listener) => listener());
}

function ensureInitialized() {
  if (initialized || initPromise) return;

  initPromise = (async () => {
    // Subscribe first so we don't incorrectly flip to "not logged in" before Firebase initializes.
    let settled = false;
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      settled = true;
      emitIfChanged({ session: (session as AuthSession) || null, loading: false });
    });

    unsubscribeAuth = () => subscription.unsubscribe();

    try {
      // Also try to read current session; if the subscription hasn't fired yet we still want a best-effort session value.
      const { data: { session } } = await authClient.auth.getSession();
      if (!settled) {
        // Do not mark loading as finished here; keep loading true until the onAuthStateChange handler runs.
        emitIfChanged({ session: (session as AuthSession) || null, loading: true });
      }
    } catch {
      if (!settled) {
        emitIfChanged({ session: null, loading: true });
      }
    }

    // Safety: if onAuthStateChange doesn't call back within a short time, clear loading so UI won't hang.
    setTimeout(() => {
      if (!settled) {
        // Finalize with whatever we have in authState but mark loading false to avoid indefinite spinner.
        emitIfChanged({ session: authState.session || null, loading: false });
      }
    }, 3000);

    initialized = true;
    initPromise = null;
  })();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureInitialized();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
      initialized = false;
      initPromise = null;
      authState = {
        session: null,
        loading: true,
      };
    }
  };
}

function getSnapshot() {
  ensureInitialized();
  return authState;
}

export function useAuthSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

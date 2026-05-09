import { resolveEdgeFunctionsBaseUrl } from "@/lib/apiConfig";
import {
  getClerkSessionSnapshot,
  refreshClerkSession,
  signOutClerkSession,
  subscribeClerkSession,
  type ClerkStoredSession,
} from "@/lib/clerkSessionStore";

type AppSession = ClerkStoredSession;

function getCurrentSession(): AppSession | null {
  return getClerkSessionSnapshot().session;
}

export const authClient = {
  auth: {
    async getSession(options?: { forceRefresh?: boolean }) {
      const session = await refreshClerkSession(options?.forceRefresh === true);
      return { data: { session } };
    },

    async getUser(options?: { forceRefresh?: boolean }) {
      const session = await refreshClerkSession(options?.forceRefresh === true);
      return { data: { user: session?.user || null } };
    },

    onAuthStateChange(callback: (event: string, session: AppSession | null) => void) {
      const initial = getCurrentSession();
      callback(initial ? "SIGNED_IN" : "SIGNED_OUT", initial);

      let previousSessionId = initial?.session_id || null;
      const unsubscribe = subscribeClerkSession((snapshot) => {
        const currentSessionId = snapshot.session?.session_id || null;
        const event = !snapshot.session
          ? "SIGNED_OUT"
          : previousSessionId && previousSessionId !== currentSessionId
            ? "TOKEN_REFRESHED"
            : "SIGNED_IN";

        previousSessionId = currentSessionId;
        callback(event, snapshot.session);
      });

      return { data: { subscription: { unsubscribe } } };
    },

    async signInWithPassword() {
      return {
        data: { user: null, session: null },
        error: new Error("Email/password sign-in is handled by Clerk"),
      };
    },

    async signUp() {
      return {
        data: { user: null, session: null },
        error: new Error("Sign-up is handled by Clerk"),
      };
    },

    async signOut() {
      try {
        await signOutClerkSession();
        sessionStorage.removeItem("firebase_pending_signup_v1");
        sessionStorage.removeItem("firebase_pending_forgot_password_v1");
        sessionStorage.removeItem("dalam_pending_imagine_prompt");
        sessionStorage.removeItem("dalam_pending_voice_prompt");
        sessionStorage.removeItem("dalam_pending_chat_message");
        return { error: null };
      } catch (error: any) {
        return { error };
      }
    },

    async resetPasswordForEmail() {
      return {
        error: new Error("Password reset is handled by Clerk"),
      };
    },

    async updateUser() {
      return {
        error: new Error("User profile updates are handled by Clerk"),
      };
    },

    async exchangeCodeForSession() {
      return {
        data: { session: null },
        error: new Error("Clerk handles session exchange automatically"),
      };
    },
  },

  functions: {
    async invoke(functionName: string, options?: { body?: unknown }) {
      try {
        const session = await refreshClerkSession();
        const baseUrl = resolveEdgeFunctionsBaseUrl();

        const response = await fetch(`${baseUrl}/${functionName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify(options?.body ?? {}),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            data: null,
            error: new Error(String((payload as any)?.error || (payload as any)?.message || `Function ${functionName} failed`)),
          };
        }

        return { data: payload, error: null };
      } catch (error: any) {
        return { data: null, error };
      }
    },
  },
};

const PENDING_REQUEST_KEYS = {
  IMAGINE: "dalam_pending_imagine_prompt",
  VOICE: "dalam_pending_voice_prompt",
  CHAT: "dalam_pending_chat_message",
} as const;

const PENDING_REQUEST_TTL_MS = 30 * 60 * 1000;

export function storePendingRequest(type: "imagine" | "voice" | "chat", data: string): void {
  try {
    const payload = JSON.stringify({ data, timestamp: Date.now() });
    sessionStorage.setItem(PENDING_REQUEST_KEYS[type], payload);
  } catch (e) {
    console.warn("Failed to store pending request:", e);
  }
}

export function getPendingRequest<T = string>(type: "imagine" | "voice" | "chat"): T | null {
  try {
    const raw = sessionStorage.getItem(PENDING_REQUEST_KEYS[type]);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { data?: T; timestamp?: number };
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > PENDING_REQUEST_TTL_MS) {
      sessionStorage.removeItem(PENDING_REQUEST_KEYS[type]);
      return null;
    }

    return parsed.data ?? null;
  } catch (e) {
    console.warn("Failed to read pending request:", e);
    return null;
  }
}

export function clearPendingRequest(type: "imagine" | "voice" | "chat"): void {
  try {
    sessionStorage.removeItem(PENDING_REQUEST_KEYS[type]);
  } catch (e) {
    console.warn("Failed to clear pending request:", e);
  }
}


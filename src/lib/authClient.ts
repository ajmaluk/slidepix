import {
	createUserWithEmailAndPassword,
	getIdToken,
	onIdTokenChanged,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut,
	updatePassword,
	updateProfile,
	type User,
} from "firebase/auth";
import { resolveEdgeFunctionsBaseUrl } from "@/lib/apiConfig";
import { firebaseAuth } from "@/lib/firebaseClient";

type AppSession = {
	user: {
		id: string;
		email: string | null;
		user_metadata: Record<string, unknown>;
	};
	access_token: string;
};

const SESSION_CACHE_TTL_MS = 10_000;

let sessionCache: { value: AppSession | null; expiresAt: number } | null = null;
let sessionInFlight: Promise<AppSession | null> | null = null;

function invalidateSessionCache() {
	sessionCache = null;
}

function readSessionCache(): AppSession | null | undefined {
	if (!sessionCache) return undefined;
	if (sessionCache.expiresAt <= Date.now()) {
		sessionCache = null;
		return undefined;
	}
	return sessionCache.value;
}

function writeSessionCache(value: AppSession | null) {
	sessionCache = {
		value,
		expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
	};
}

function toSession(user: User, token: string): AppSession {
	return {
		user: {
			id: user.uid,
			email: user.email,
			user_metadata: {
				full_name: user.displayName || user.email?.split("@")[0] || "User",
			},
		},
		access_token: token,
	};
}

async function getSessionInternal(): Promise<AppSession | null> {
	const user = firebaseAuth.currentUser;
	if (!user) {
		writeSessionCache(null);
		return null;
	}
	const token = await getIdToken(user);
	const session = toSession(user, token);
	writeSessionCache(session);
	return session;
}

async function getSessionCached(forceRefresh = false): Promise<AppSession | null> {
	if (!forceRefresh) {
		const cached = readSessionCache();
		if (cached !== undefined) {
			return cached;
		}
	}

	if (!sessionInFlight) {
		sessionInFlight = getSessionInternal().finally(() => {
			sessionInFlight = null;
		});
	}

	return sessionInFlight;
}

export const authClient = {
	auth: {
		async getSession(options?: { forceRefresh?: boolean }) {
			const session = await getSessionCached(options?.forceRefresh === true);
			return { data: { session } };
		},

		async getUser(options?: { forceRefresh?: boolean }) {
			const session = await getSessionCached(options?.forceRefresh === true);
			return { data: { user: session?.user || null } };
		},

		onAuthStateChange(callback: (event: string, session: AppSession | null) => void) {
			const unsubscribe = onIdTokenChanged(firebaseAuth, async (user) => {
				invalidateSessionCache();
				if (!user) {
					callback("SIGNED_OUT", null);
					return;
				}
				const token = await getIdToken(user);
				const session = toSession(user, token);
				writeSessionCache(session);
				callback("SIGNED_IN", session);
			});

			return { data: { subscription: { unsubscribe } } };
		},

		async signInWithPassword({ email, password }: { email: string; password: string }) {
			try {
				const creds = await signInWithEmailAndPassword(firebaseAuth, email, password);
				const token = await getIdToken(creds.user);
				const session = toSession(creds.user, token);
				writeSessionCache(session);
				return { data: { user: session.user, session }, error: null };
			} catch (error: any) {
				invalidateSessionCache();
				return { data: { user: null, session: null }, error };
			}
		},

		async signUp({
			email,
			password,
			options,
		}: {
			email: string;
			password: string;
			options?: { data?: Record<string, unknown> };
		}) {
			try {
				const creds = await createUserWithEmailAndPassword(firebaseAuth, email, password);
				const fullName = String(options?.data?.full_name || "").trim();
				if (fullName) {
					await updateProfile(creds.user, { displayName: fullName });
				}
				const token = await getIdToken(creds.user);
				const session = toSession(creds.user, token);
				writeSessionCache(session);
				return { data: { user: session.user, session }, error: null };
			} catch (error: any) {
				invalidateSessionCache();
				return { data: { user: null, session: null }, error };
			}
		},

		async signOut() {
			try {
				await signOut(firebaseAuth);
				sessionStorage.removeItem("firebase_pending_signup_v1");
				sessionStorage.removeItem("firebase_pending_forgot_password_v1");
				sessionStorage.removeItem("dalam_pending_imagine_prompt");
				sessionStorage.removeItem("dalam_pending_voice_prompt");
				sessionStorage.removeItem("dalam_pending_chat_message");
				invalidateSessionCache();
				return { error: null };
			} catch (error: any) {
				return { error };
			}
		},

		async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
			try {
				await sendPasswordResetEmail(firebaseAuth, email, options?.redirectTo ? {
					url: options.redirectTo,
					handleCodeInApp: true,
				} : undefined);
				return { error: null };
			} catch (error: any) {
				return { error };
			}
		},

		async updateUser({ password, data }: { password?: string; data?: Record<string, unknown> }) {
			try {
				const user = firebaseAuth.currentUser;
				if (!user) throw new Error("No active user");

				if (password) {
					await updatePassword(user, password);
				}

				const fullName = String(data?.full_name || "").trim();
				if (fullName) {
					await updateProfile(user, { displayName: fullName });
				}

				const token = await getIdToken(user);
				writeSessionCache(toSession(user, token));

				return { error: null };
			} catch (error: any) {
				return { error };
			}
		},

		async exchangeCodeForSession() {
			return { data: { session: null }, error: new Error("exchangeCodeForSession is not supported in Firebase mode") };
		},
	},

	functions: {
		async invoke(functionName: string, options?: { body?: unknown }) {
			try {
				const user = firebaseAuth.currentUser;
				const token = user ? await getIdToken(user) : null;
				const baseUrl = resolveEdgeFunctionsBaseUrl();

				const response = await fetch(`${baseUrl}/${functionName}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify(options?.body ?? {}),
				});

				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					return { data: null, error: new Error(String((payload as any)?.error || (payload as any)?.message || `Function ${functionName} failed`)) };
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
		
		const parsed = JSON.parse(raw) as { data: T; timestamp: number };
		if (Date.now() - parsed.timestamp > PENDING_REQUEST_TTL_MS) {
			sessionStorage.removeItem(PENDING_REQUEST_KEYS[type]);
			return null;
		}
		return parsed.data;
	} catch (e) {
		console.warn("Failed to get pending request:", e);
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

export function hasPendingRequest(type: "imagine" | "voice" | "chat"): boolean {
	return getPendingRequest(type) !== null;
}

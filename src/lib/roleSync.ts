import { authClient } from "@/lib/authClient";
import { ensureUserSubscription, getUserSubscription } from "@/lib/subscription";
import { firebaseDb } from "@/lib/firebaseClient";
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";

export type UserRole = "admin" | "user";

export type RoleSyncRow = {
  user_id: string;
  role: UserRole;
  full_name: string;
  is_banned: boolean;
};

export type RoleSyncResult = {
  ok: boolean;
  userId: string | null;
  row: RoleSyncRow | null;
  created: boolean;
  error: string | null;
  schemaMismatch: boolean;
  failedCollection?: "user_subscriptions" | "users" | null;
};

function isFirestorePermissionDenied(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message || "").toLowerCase();
  return code === "permission-denied" || message.includes("permission-denied") || message.includes("missing or insufficient permissions");
}

function withCollectionWriteError(collectionName: "user_subscriptions" | "users", err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err || "Unknown error");
  return new Error(`${collectionName} write failed: ${message}`);
}

function detectFailedCollectionFromError(err: unknown): "user_subscriptions" | "users" | null {
  const message = String((err as { message?: string } | null)?.message || "").toLowerCase();
  if (message.includes("users write failed")) return "users";
  if (message.includes("user_subscriptions write failed")) return "user_subscriptions";
  return null;
}

function scoreProfileRecord(record: Record<string, unknown>): number {
  const importantFields = [
    "full_name",
    "email",
    "role",
    "tier",
    "auth_provider",
    "date_of_birth",
    "country",
    "created_at",
    "updated_at",
    "account_created_at",
  ];

  let score = 0;
  for (const field of importantFields) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) score += 2;
    if (typeof value === "boolean") score += 1;
    if (typeof value === "number" && Number.isFinite(value)) score += 1;
  }

  const updatedAt = Date.parse(String(record.updated_at || ""));
  if (Number.isFinite(updatedAt)) {
    score += Math.floor(updatedAt / 1000 / 60 / 60 / 24 / 365); // small recency bias
  }

  return score;
}

function coalesceValue(primary: unknown, fallback: unknown): unknown {
  if (primary === null || primary === undefined) return fallback;
  if (typeof primary === "string" && primary.trim() === "") return fallback;
  return primary;
}

function mergeProfiles(
  base: Record<string, unknown> | null,
  candidate: Record<string, unknown> | null,
  userId: string,
  nowIso: string
): Record<string, unknown> {
  const sourceA = base || {};
  const sourceB = candidate || {};
  const keys = new Set([...Object.keys(sourceA), ...Object.keys(sourceB)]);
  const merged: Record<string, unknown> = {};

  for (const key of keys) {
    merged[key] = coalesceValue(sourceA[key], sourceB[key]);
  }

  merged.user_id = userId;
  if (!merged.updated_at) merged.updated_at = nowIso;
  return merged;
}

async function migrateLegacyCollectionDocs(
  collectionName: "user_subscriptions" | "users",
  userId: string
): Promise<void> {
  const q = query(collection(firebaseDb, collectionName), where("user_id", "==", userId));
  const snap = await getDocs(q);
  if (snap.empty) return;

  const nowIso = new Date().toISOString();
  const docs = snap.docs.map((d) => ({ id: d.id, data: (d.data() as Record<string, unknown>) || {} }));
  const canonical = docs.find((d) => d.id === userId) || null;
  const legacy = docs.filter((d) => d.id !== userId);

  if (legacy.length === 0) return;

  let bestLegacy: { id: string; data: Record<string, unknown> } | null = null;
  for (const candidate of legacy) {
    if (!bestLegacy || scoreProfileRecord(candidate.data) > scoreProfileRecord(bestLegacy.data)) {
      bestLegacy = candidate;
    }
  }

  const merged = mergeProfiles(canonical?.data || null, bestLegacy?.data || null, userId, nowIso);
  await setDoc(doc(firebaseDb, collectionName, userId), merged, { merge: true });

  for (const old of legacy) {
    try {
      await deleteDoc(doc(firebaseDb, collectionName, old.id));
    } catch {
      // Best-effort cleanup only; missing permission should not block sign-in.
    }
  }
}

async function migrateLegacyProfileDocs(userId: string): Promise<void> {
  try {
    await migrateLegacyCollectionDocs("user_subscriptions", userId);
  } catch {
    // Best-effort migration; continue role sync even if legacy docs are not readable.
  }

  try {
    await migrateLegacyCollectionDocs("users", userId);
  } catch {
    // Best-effort migration; continue role sync even if legacy docs are not readable.
  }
}

export async function runRoleSyncForCurrentSession(): Promise<RoleSyncResult> {
  const {
    data: { session },
  } = await authClient.auth.getSession();

  if (!session?.user) {
    return {
      ok: false,
      userId: null,
      row: null,
      created: false,
      error: "No active session",
      schemaMismatch: false,
      failedCollection: null,
    };
  }

  const user = session.user;

  try {
    await migrateLegacyProfileDocs(user.id);

    const existing = await getUserSubscription(user.id);
    const ensured = existing || await ensureUserSubscription(user.id);

    try {
      await setDoc(doc(firebaseDb, "users", user.id), {
        user_id: ensured.user_id,
        full_name: ensured.full_name,
        email: ensured.email,
        role: ensured.role,
        tier: ensured.tier,
        is_active: ensured.is_active,
        is_banned: ensured.is_banned,
        subscription_active: ensured.subscription_active,
        auth_provider: ensured.auth_provider || "firebase",
        date_of_birth: ensured.date_of_birth || null,
        country: ensured.country || null,
        account_created_at: ensured.account_created_at || ensured.created_at,
        created_at: ensured.created_at,
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      throw withCollectionWriteError("users", err);
    }

    return {
      ok: true,
      userId: user.id,
      row: {
        user_id: ensured.user_id,
        role: ensured.role,
        full_name: ensured.full_name,
        is_banned: ensured.is_banned,
      },
      created: !existing,
      error: null,
      schemaMismatch: false,
      failedCollection: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Role sync failed";
    return {
      ok: false,
      userId: user.id,
      row: null,
      created: false,
      error: message,
      schemaMismatch: isFirestorePermissionDenied(err),
      failedCollection: detectFailedCollectionFromError(err),
    };
  }
}

export async function runRoleSyncForUserId(
  targetUserId: string,
  options?: {
    fullName?: string;
    email?: string | null;
    dateOfBirth?: string | null;
    country?: string | null;
    authProvider?: string | null;
  }
): Promise<RoleSyncResult> {
  const trimmedUserId = targetUserId.trim();
  if (!trimmedUserId) {
    return {
      ok: false,
      userId: null,
      row: null,
      created: false,
      error: "target user_id is required",
      schemaMismatch: false,
      failedCollection: null,
    };
  }

  try {
    await migrateLegacyProfileDocs(trimmedUserId);

    const hasExplicitFullName = typeof options?.fullName === "string" && options.fullName.trim().length > 0;
    const hasExplicitEmail = options ? Object.prototype.hasOwnProperty.call(options, "email") : false;
    const hasExplicitDob = options ? Object.prototype.hasOwnProperty.call(options, "dateOfBirth") : false;
    const hasExplicitCountry = options ? Object.prototype.hasOwnProperty.call(options, "country") : false;
    const hasExplicitProvider = options ? Object.prototype.hasOwnProperty.call(options, "authProvider") : false;

    const normalizedEmail = typeof options?.email === "string" ? options.email.trim().toLowerCase() : null;
    const normalizedDob = typeof options?.dateOfBirth === "string" ? options.dateOfBirth.trim() : "";
    const normalizedCountry = typeof options?.country === "string" ? options.country.trim() : "";
    const normalizedProvider = typeof options?.authProvider === "string" ? options.authProvider.trim() : "";
    const nowIso = new Date().toISOString();
    const existing = await getUserSubscription(trimmedUserId);
    const preferredName = hasExplicitFullName
      ? String(options?.fullName).trim()
      : (existing?.full_name || "").trim() || "User";

    const updatePayload: Record<string, unknown> = {
      user_id: trimmedUserId,
      full_name: preferredName,
      role: existing?.role || "user",
      tier: existing?.tier || "free",
      is_active: existing?.is_active ?? true,
      is_banned: existing?.is_banned ?? false,
      subscription_active: existing?.subscription_active ?? true,
      created_at: existing?.created_at || nowIso,
      updated_at: nowIso,
    };

    if (hasExplicitEmail) {
      updatePayload.email = normalizedEmail;
    }

    if (hasExplicitDob && normalizedDob) {
      updatePayload.date_of_birth = normalizedDob;
    }

    if (hasExplicitCountry && normalizedCountry) {
      updatePayload.country = normalizedCountry;
    }

    if (hasExplicitProvider && normalizedProvider) {
      updatePayload.auth_provider = normalizedProvider;
    }

    if (!existing) {
      updatePayload.account_created_at = nowIso;
    }

    try {
      await setDoc(doc(firebaseDb, "user_subscriptions", trimmedUserId), updatePayload, { merge: true });
    } catch (err) {
      throw withCollectionWriteError("user_subscriptions", err);
    }
    try {
      await setDoc(doc(firebaseDb, "users", trimmedUserId), {
        user_id: trimmedUserId,
        full_name: preferredName,
        email: hasExplicitEmail ? normalizedEmail : existing?.email || null,
        role: existing?.role || "user",
        tier: existing?.tier || "free",
        is_active: existing?.is_active ?? true,
        is_banned: existing?.is_banned ?? false,
        subscription_active: existing?.subscription_active ?? true,
        auth_provider: hasExplicitProvider ? normalizedProvider : (existing?.auth_provider || "firebase"),
        date_of_birth: hasExplicitDob && normalizedDob ? normalizedDob : (existing?.date_of_birth || null),
        country: hasExplicitCountry && normalizedCountry ? normalizedCountry : (existing?.country || null),
        account_created_at: existing?.account_created_at || nowIso,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
        last_login: nowIso,
      }, { merge: true });
    } catch (err) {
      throw withCollectionWriteError("users", err);
    }

    if (existing) {
      return {
        ok: true,
        userId: trimmedUserId,
        row: {
          user_id: existing.user_id,
          role: existing.role,
          full_name: preferredName,
          is_banned: existing.is_banned,
        },
        created: false,
        error: null,
        schemaMismatch: false,
        failedCollection: null,
      };
    }

    return {
      ok: true,
      userId: trimmedUserId,
      row: {
        user_id: trimmedUserId,
        role: "user",
        full_name: preferredName,
        is_banned: false,
      },
      created: true,
      error: null,
      schemaMismatch: false,
      failedCollection: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Role sync failed";
    return {
      ok: false,
      userId: trimmedUserId,
      row: null,
      created: false,
      error: message,
      schemaMismatch: isFirestorePermissionDenied(err),
      failedCollection: detectFailedCollectionFromError(err),
    };
  }
}

export function getRolePath(role: UserRole): string {
  if (role === "admin") return "/admin";
  return "/slides";
}

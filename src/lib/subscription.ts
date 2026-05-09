/**
 * Subscription tier management
 * Controls feature access based on user subscription level.
 * 
 * isPaidActivated: Master switch. When false, all paid-plan features are disabled.
 * Set to true when ready to enable paid features.
 */
import { authClient } from "./authClient";
import { BILLING_CATALOG, getBillingPlan, normalizeBillingPlanKey } from "@/lib/billingCatalog";
import { firebaseDb } from "@/lib/firebaseClient";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

export type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";

export interface UserSubscription {
  id: string;
  user_id: string;
  role: "admin" | "user";
  full_name: string;
  email: string | null;
  date_of_birth?: string | null;
  country?: string | null;
  auth_provider?: string | null;
  tier: SubscriptionTier;
  is_active: boolean;
  is_banned: boolean;
  subscription_active: boolean;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  cancel_at_period_end: boolean;
  plan_duration_days: number;
  auto_renew: boolean;
  api_requests_today: number;
  pro_requests_today: number;
  api_requests_reset_at: string | null;
  pro_requests_reset_at: string | null;
  visits_today: number;
  last_visit_date: string | null;
  ecommerce_requests_today?: number;
  ecommerce_requests_reset_at?: string | null;
  builder_requests_today?: number;
  builder_requests_reset_at?: string | null;
  image_requests_today?: number;
  image_requests_reset_at?: string | null;
  voice_requests_today?: number;
  voice_requests_reset_at?: string | null;
  api_key: string | null;
  last_login: string | null;
  account_created_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  owner_name?: string | null;
  owner_email?: string | null;
  name: string;
  key: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type ApiKeyValidationResult = {
  ok: boolean;
  status: number;
  message: string;
  keyId?: string;
  userId?: string;
  tier?: SubscriptionTier;
};

export function getApiKeyValidationMessage(result: ApiKeyValidationResult): string {
  if (result.ok) return result.message;
  const { status, message, tier } = result;
  if (status === 401) return `Authentication failed: ${message}`;
  if (status === 402) return `Payment required: ${message}`;
  if (status === 429) return message;
  if (status === 500) return "Internal server error";
  return `${message} (${tier || "unknown"})`;
}

const SUBSCRIPTION_CACHE_TTL_MS = 15_000;
const API_KEYS_CACHE_TTL_MS = 15_000;

const subscriptionCache = new Map<string, CacheEntry<UserSubscription | null>>();
const apiKeysCache = new Map<string, CacheEntry<ApiKey[]>>();
const subscriptionInFlight = new Map<string, Promise<UserSubscription | null>>();
const apiKeysInFlight = new Map<string, Promise<ApiKey[]>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidateSubscriptionCache(userId: string) {
  subscriptionCache.delete(userId);
}

function invalidateApiKeysCache(userId: string) {
  apiKeysCache.delete(userId);
}

function patchApiKeyAcrossCaches(
  keyId: string,
  updater: (key: ApiKey) => ApiKey | null
) {
  for (const [userId, entry] of apiKeysCache.entries()) {
    const next = entry.value
      .map((k) => (k.id === keyId ? updater(k) : k))
      .filter((k): k is ApiKey => k !== null);
    writeCache(apiKeysCache, userId, next, API_KEYS_CACHE_TTL_MS);
  }
}

function sortApiKeysByCreatedAtDesc(keys: ApiKey[]): ApiKey[] {
  return [...keys].sort((left, right) => {
    const leftTime = Date.parse(left.created_at || "");
    const rightTime = Date.parse(right.created_at || "");

    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;

    if (safeLeft !== safeRight) {
      return safeRight - safeLeft;
    }

    return right.id.localeCompare(left.id);
  });
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toStringWithFallback(value: unknown, fallback: string): string {
  return toOptionalString(value) || fallback;
}

function normalizeUserRole(value: unknown): UserSubscription["role"] {
  return value === "admin" ? "admin" : "user";
}

function isStaffRole(role: UserSubscription['role'] | null | undefined): boolean {
  return role === "admin";
}

export { isStaffRole };

function isSubscriptionActiveForApi(sub: UserSubscription): boolean {
  if (!sub.is_active || sub.is_banned || !sub.subscription_active) return false;
  if (!sub.subscription_expires_at) return true;
  const expiryMs = Date.parse(sub.subscription_expires_at);
  return Number.isFinite(expiryMs) ? expiryMs > Date.now() : true;
}

function isSameDay(dateStr: string | null): boolean {
  if (!dateStr) return false;
  
  const today = new Date();
  const nowDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Check if it matches the current local date string, or falls back to date parsing
  if (dateStr === nowDate) return true;
  if (dateStr.length === 10 && dateStr.includes("-")) return false;
  
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

function shouldResetDailyUsage(resetAt: string | null): boolean {
  if (!resetAt) return true;
  const resetDate = new Date(resetAt);
  if (Number.isNaN(resetDate.getTime())) return true;
  
  // Use the same robust local time logic
  const today = new Date();
  return !(resetDate.getFullYear() === today.getFullYear() &&
           resetDate.getMonth() === today.getMonth() &&
           resetDate.getDate() === today.getDate());
}

function isFirestorePermissionDenied(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message || "").toLowerCase();
  return code === "permission-denied" || message.includes("permission-denied") || message.includes("missing or insufficient permissions");
}

async function maybeResetDailyUsage(userId: string, sub: UserSubscription): Promise<UserSubscription> {
  const shouldResetApi = shouldResetDailyUsage(sub.api_requests_reset_at);
  const shouldResetPro = shouldResetDailyUsage(sub.pro_requests_reset_at);
  const shouldResetEcommerce = shouldResetDailyUsage(sub.ecommerce_requests_reset_at || null);
  const shouldResetVisits = !isSameDay(sub.last_visit_date);

  if (!shouldResetApi && !shouldResetPro && !shouldResetEcommerce && !shouldResetVisits) return sub;

  const nowIso = new Date().toISOString();
  const nowDate = nowIso.split("T")[0];

  const patched: UserSubscription = {
    ...sub,
    api_requests_today: shouldResetApi ? 0 : sub.api_requests_today,
    api_requests_reset_at: shouldResetApi ? nowIso : sub.api_requests_reset_at,
    pro_requests_today: shouldResetPro ? 0 : sub.pro_requests_today,
    pro_requests_reset_at: shouldResetPro ? nowIso : sub.pro_requests_reset_at,
    ecommerce_requests_today: shouldResetEcommerce ? 0 : (sub.ecommerce_requests_today ?? 0),
    ecommerce_requests_reset_at: shouldResetEcommerce ? nowIso : sub.ecommerce_requests_reset_at,
    visits_today: shouldResetVisits ? 0 : sub.visits_today,
    last_visit_date: shouldResetVisits ? nowDate : sub.last_visit_date,
    updated_at: nowIso,
  };

  const updatePayload: Record<string, unknown> = {
    updated_at: nowIso,
  };

  if (shouldResetApi) {
    updatePayload.api_requests_today = 0;
    updatePayload.api_requests_reset_at = nowIso;
  }
  if (shouldResetPro) {
    updatePayload.pro_requests_today = 0;
    updatePayload.pro_requests_reset_at = nowIso;
  }
  if (shouldResetEcommerce) {
    updatePayload.ecommerce_requests_today = 0;
    updatePayload.ecommerce_requests_reset_at = nowIso;
  }
  if (shouldResetVisits) {
    updatePayload.visits_today = 0;
    updatePayload.last_visit_date = nowDate;
  }
  if (shouldResetDailyUsage(sub.voice_requests_reset_at || null)) {
    updatePayload.voice_requests_today = 0;
    updatePayload.voice_requests_reset_at = nowIso;
    patched.voice_requests_today = 0;
    patched.voice_requests_reset_at = nowIso;
  }
  if (shouldResetDailyUsage(sub.image_requests_reset_at || null)) {
    updatePayload.image_requests_today = 0;
    updatePayload.image_requests_reset_at = nowIso;
    patched.image_requests_today = 0;
    patched.image_requests_reset_at = nowIso;
  }
  if (shouldResetDailyUsage(sub.builder_requests_reset_at || null)) {
    updatePayload.builder_requests_today = 0;
    updatePayload.builder_requests_reset_at = nowIso;
    patched.builder_requests_today = 0;
    patched.builder_requests_reset_at = nowIso;
  }

  try {
    await setDoc(doc(firebaseDb, "user_subscriptions", userId), updatePayload, { merge: true });
  } catch (err) {
    console.warn("Failed to reset daily usage counters:", err);
  }

  writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
  return patched;
}

function canManageApiForSubscription(sub: UserSubscription | null): boolean {
  if (!sub || !isPaidActivated) return false;
  const features = getEffectiveFeatures(sub);
  return features.canGenerateApiKey && isSubscriptionActiveForApi(sub);
}

// ═══════════════════════════════════════════════════════
// MASTER SWITCH — Paid features are active via Clerk billing
// ═══════════════════════════════════════════════════════
export const isPaidActivated = true;

// ─── Tier Feature Definitions ───
export interface TierFeatures {
  maxChatsPerDay: number;
  maxMessagesPerChat: number;
  canGenerateApiKey: boolean;
  maxApiKeys: number;
  canUseWebSearch: boolean;
  canUseImageGen: boolean;
  canExportChats: boolean;
  canCreateGroups: boolean;
  canCreateProjects: boolean;
  maxApiRequestsPerDay: number;
  maxApiRequestsPerMonth: number;
  maxProRequestsPerDay: number;
  maxBuilderRequestsPerDay: number;
  maxEcommerceRequestsPerDay: number;
  maxVoiceRequestsPerDay: number;
  maxImageGenPerDay: number;
  availableModels: string[];
  label: string;
  description: string;
}

export const TIER_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  free: {
    maxChatsPerDay: -1,
    maxMessagesPerChat: -1,
    canGenerateApiKey: false,
    maxApiKeys: 0,
    canUseWebSearch: true,
    canUseImageGen: false,
    canExportChats: true,
    canCreateGroups: true,
    canCreateProjects: true,
    maxApiRequestsPerDay: 0,
    maxApiRequestsPerMonth: 0,
    maxProRequestsPerDay: 10,
    maxBuilderRequestsPerDay: 2,
    maxEcommerceRequestsPerDay: 50,
    maxVoiceRequestsPerDay: 10,
    maxImageGenPerDay: 2,
    availableModels: ["dalam"],
    label: "Free",
    description: "Unlimited chat with no API access",
  },
  basic: {
    maxChatsPerDay: -1,
    maxMessagesPerChat: -1,
    canGenerateApiKey: true,
    maxApiKeys: 2,
    canUseWebSearch: true,
    canUseImageGen: true,
    canExportChats: true,
    canCreateGroups: true,
    canCreateProjects: true,
    maxApiRequestsPerDay: 50,
    maxApiRequestsPerMonth: 1500,
    maxProRequestsPerDay: 50,
    maxBuilderRequestsPerDay: 10,
    maxEcommerceRequestsPerDay: 200,
    maxVoiceRequestsPerDay: 50,
    maxImageGenPerDay: 10,
    availableModels: ["dalam"],
    label: "Basic",
    description: "Unlimited chat and more models",
  },
  pro: {
    maxChatsPerDay: -1,
    maxMessagesPerChat: -1,
    canGenerateApiKey: true,
    maxApiKeys: 5,
    canUseWebSearch: true,
    canUseImageGen: true,
    canExportChats: true,
    canCreateGroups: true,
    canCreateProjects: true,
    maxApiRequestsPerDay: 200,
    maxApiRequestsPerMonth: 6000,
    maxProRequestsPerDay: 200,
    maxBuilderRequestsPerDay: 50,
    maxEcommerceRequestsPerDay: 500,
    maxVoiceRequestsPerDay: 200,
    maxImageGenPerDay: 50,
    availableModels: ["dalam"],
    label: "Pro",
    description: "Full access with high API limits",
  },
  enterprise: {
    maxChatsPerDay: -1,
    maxMessagesPerChat: -1,
    canGenerateApiKey: true,
    maxApiKeys: 10,
    canUseWebSearch: true,
    canUseImageGen: true,
    canExportChats: true,
    canCreateGroups: true,
    canCreateProjects: true,
    maxApiRequestsPerDay: 500,
    maxApiRequestsPerMonth: 15000,
    maxProRequestsPerDay: 500,
    maxBuilderRequestsPerDay: 200,
    maxEcommerceRequestsPerDay: -1,
    maxVoiceRequestsPerDay: 500,
    maxImageGenPerDay: 200,
    availableModels: ["dalam"],
    label: "Enterprise",
    description: "Unlimited everything for teams",
  },
};

const STAFF_FEATURE_OVERRIDES: TierFeatures = {
    maxChatsPerDay: -1,
    maxMessagesPerChat: -1,
    canGenerateApiKey: true,
    maxApiKeys: 10,
    canUseWebSearch: true,
    canUseImageGen: true,
    canExportChats: true,
    canCreateGroups: true,
    canCreateProjects: true,
    // Unlimited API usage for staff roles; gating will be bypassed by -1 checks
    maxApiRequestsPerDay: -1,
    maxApiRequestsPerMonth: -1,
    maxProRequestsPerDay: -1,
    maxBuilderRequestsPerDay: -1,
    maxEcommerceRequestsPerDay: -1,
    maxVoiceRequestsPerDay: -1,
    maxImageGenPerDay: -1,
    availableModels: ["dalam"],
    label: "Lifetime",
    description: "Lifetime access to all Dalam features and API",
  };

export { STAFF_FEATURE_OVERRIDES };

/**
 * Get effective features for a user.
 * When isPaidActivated is false, everyone gets unlimited chat
 * but other paid-plan features like image gen or API key gen remain gated.
 */
export function getEffectiveFeatures(sub: UserSubscription | null): TierFeatures {
  // Always allow unlimited chat regardless of isPaidActivated
  const baseFeatures = TIER_FEATURES.free;

  if (sub && isStaffRole(sub.role)) {
    return STAFF_FEATURE_OVERRIDES;
  }
  
  if (!isPaidActivated || !sub || !sub.subscription_active) {
    return {
      ...baseFeatures,
      maxChatsPerDay: -1,
      maxMessagesPerChat: -1,
      label: !sub ? "Guest" : "Free",
    };
  }
  
  const tierFeatures = TIER_FEATURES[sub.tier] || baseFeatures;
  return {
    ...tierFeatures,
    maxChatsPerDay: -1, // Force unlimited chat for all tiers
    maxMessagesPerChat: -1,
  };
}

/**
 * Get UI styles for a tier badge
 */
export function getTierBadgeStyle(tier: SubscriptionTier | "guest" | null): { 
  label: string; 
  classes: string;
  icon?: string;
} {
  if (!tier || tier === "guest") {
    return { 
      label: "Guest", 
      classes: "bg-muted-foreground/10 text-muted-foreground/60 border-muted-foreground/20" 
    };
  }

  switch (tier) {
    case "free":
      return { 
        label: "Free", 
        classes: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
      };
    case "basic":
      return { 
        label: "Basic", 
        classes: "bg-blue-500/10 text-blue-500 border-blue-500/20" 
      };
    case "pro":
      return { 
        label: "Pro", 
        classes: "bg-violet-500/10 text-violet-500 border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.1)]" 
      };
    case "enterprise":
      return { 
        label: "Enterprise", 
        classes: "bg-amber-500/10 text-amber-500 border-amber-500/20 font-black" 
      };
    default:
      return { 
        label: "Free", 
        classes: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20" 
      };
  }
}

/**
 * Calculate pro-rated upgrade price
 */
export function calculateUpgradePrice(
  currentSub: UserSubscription | null,
  targetTier: SubscriptionTier,
  targetDurationDays: number = 30
): { finalPrice: number; discount: number } {
  const targetPlan = TIER_PRICES[targetTier];
  if (!targetPlan) return { finalPrice: 0, discount: 0 };

  const fullPrice = targetDurationDays >= 365 ? targetPlan.yearly : targetPlan.monthly;

  if (!currentSub || !currentSub.subscription_active || currentSub.tier === "free") {
    return { finalPrice: fullPrice, discount: 0 };
  }

  // Simple pro-rating logic:
  // (Full Price of New) - (Remaining value of Old)
  
  const now = new Date();
  const expiresAt = currentSub.subscription_expires_at ? new Date(currentSub.subscription_expires_at) : null;
  const startedAt = new Date(currentSub.created_at);
  
  if (!expiresAt || expiresAt <= now) {
    return { finalPrice: fullPrice, discount: 0 };
  }

  const totalDuration = expiresAt.getTime() - startedAt.getTime();
  const remainingDuration = expiresAt.getTime() - now.getTime();
  
  if (totalDuration <= 0) return { finalPrice: fullPrice, discount: 0 };

  const currentPlanPrice = TIER_PRICES[currentSub.tier]?.monthly || 0;
  const remainingValue = (remainingDuration / totalDuration) * currentPlanPrice;
  
  // Ensure discount doesn't exceed new price and is at least 0
  const discount = Math.max(0, Math.min(fullPrice, Math.floor(remainingValue)));
  const finalPrice = Math.max(0, fullPrice - discount);

  return { finalPrice, discount };
}

export const TIER_PRICES: Record<Exclude<SubscriptionTier, "free">, { monthly: number; yearly: number }> = {
  basic: {
    monthly: getBillingPlan("basic").monthlyBaseFee,
    yearly: getBillingPlan("basic").annualBaseFee,
  },
  pro: {
    monthly: getBillingPlan("pro").monthlyBaseFee,
    yearly: getBillingPlan("pro").annualBaseFee,
  },
  enterprise: {
    monthly: getBillingPlan("enterprise").monthlyBaseFee,
    yearly: getBillingPlan("enterprise").annualBaseFee,
  }
};

export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: SubscriptionTier;
  price_monthly: number;
  price_yearly: number;
  description: string;
  features: string[];
  is_active: boolean;
  highlighted: boolean;
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return BILLING_CATALOG.filter((plan) => plan.key !== "free").map((plan) => ({
    id: plan.key,
    name: plan.name,
    tier: plan.key,
    price_monthly: plan.monthlyBaseFee,
    price_yearly: plan.annualBaseFee,
    description: plan.description,
    features: plan.features,
    is_active: plan.publiclyAvailable,
    highlighted: Boolean(plan.highlighted),
  }));
}

/**
 * Check if a specific feature is available
 */
export function canAccessFeature(
  sub: UserSubscription | null,
  feature: keyof TierFeatures
): boolean {
  if (!sub) return false;
  if (sub.is_banned) return false;
  const features = getEffectiveFeatures(sub);
  const value = features[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return true;
}

// ─── Database Operations ───

export async function getUserSubscription(
  userId: string,
  options?: { forceRefresh?: boolean }
): Promise<UserSubscription | null> {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh) {
    const cached = readCache(subscriptionCache, userId);
    if (cached !== null) return cached;

    const inFlight = subscriptionInFlight.get(userId);
    if (inFlight) return inFlight;
  }

  const request = (async () => {
    try {
      const { data: { user } } = await authClient.auth.getUser();
      const isCurrentUser = user?.id === userId;

      const ref = doc(firebaseDb, "user_subscriptions", userId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;

      const data = snap.data() as Partial<UserSubscription>;
      const nowIso = new Date().toISOString();
      const tier = normalizeBillingPlanKey(data.tier);

      const result: UserSubscription = {
        id: userId,
        user_id: userId,
        role: normalizeUserRole(data.role),
        full_name: data.full_name || (isCurrentUser ? String(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User") : "User"),
        email: data.email || (isCurrentUser ? user?.email : null) || null,
        tier,
        is_active: data.is_active !== false,
        is_banned: Boolean(data.is_banned),
        subscription_active: data.subscription_active !== false,
        subscription_started_at: data.subscription_started_at || null,
        subscription_expires_at: data.subscription_expires_at || null,
        cancel_at_period_end: Boolean(data.cancel_at_period_end),
        plan_duration_days: Number(data.plan_duration_days ?? (tier === "free" ? 0 : 30)),
        auto_renew: Boolean(data.auto_renew),
        api_requests_today: Number(data.api_requests_today ?? 0),
        pro_requests_today: Number(data.pro_requests_today ?? 0),
        api_requests_reset_at: data.api_requests_reset_at || null,
        pro_requests_reset_at: data.pro_requests_reset_at || null,
        visits_today: Number(data.visits_today ?? 0),
        last_visit_date: typeof data.last_visit_date === "string" ? data.last_visit_date : null,
        ecommerce_requests_today: Number(data.ecommerce_requests_today ?? 0),
        ecommerce_requests_reset_at: data.ecommerce_requests_reset_at || null,
        builder_requests_today: Number(data.builder_requests_today ?? 0),
        builder_requests_reset_at: data.builder_requests_reset_at || null,
        image_requests_today: Number(data.image_requests_today ?? 0),
        image_requests_reset_at: data.image_requests_reset_at || null,
        voice_requests_today: Number(data.voice_requests_today ?? 0),
        voice_requests_reset_at: data.voice_requests_reset_at || null,
        api_key: data.api_key || null,
        last_login: data.last_login || null,
        date_of_birth: data.date_of_birth || null,
        country: data.country || null,
        auth_provider: data.auth_provider || null,
        created_at: data.created_at || nowIso,
        updated_at: data.updated_at || nowIso,
      };

      const normalizedResult = await maybeResetDailyUsage(userId, result);
      writeCache(subscriptionCache, userId, normalizedResult, SUBSCRIPTION_CACHE_TTL_MS);
      return normalizedResult;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "permission-denied") {
        console.debug("Subscription lookup permission denied; returning null subscription.");
      } else {
        console.error("Critical error in getUserSubscription:", err);
      }
      return null;
    }
  })();

  if (!forceRefresh) {
    subscriptionInFlight.set(userId, request);
  }

  try {
    return await request;
  } finally {
    subscriptionInFlight.delete(userId);
  }
}

function buildSubscriptionFromMirror(
  userId: string,
  source: Record<string, unknown>,
  fallback: {
    fullName: string;
    email: string | null;
    dateOfBirth: string | null;
    country: string | null;
    authProvider: string | null;
  }
): UserSubscription {
  const nowIso = new Date().toISOString();
  const nowDate = nowIso.split("T")[0];
  const tier = normalizeBillingPlanKey(source.tier);

  return {
    id: userId,
    user_id: userId,
    role: normalizeUserRole(source.role),
    full_name: toStringWithFallback(source.full_name, fallback.fullName),
    email: toOptionalString(source.email) || fallback.email,
    date_of_birth: toOptionalString(source.date_of_birth) || fallback.dateOfBirth,
    country: toOptionalString(source.country) || fallback.country,
    auth_provider: toOptionalString(source.auth_provider) || fallback.authProvider || "firebase",
    tier,
    is_active: source.is_active !== false,
    is_banned: Boolean(source.is_banned),
    subscription_active: source.subscription_active !== false,
    subscription_started_at: toOptionalString(source.subscription_started_at),
    subscription_expires_at: toOptionalString(source.subscription_expires_at),
    cancel_at_period_end: Boolean(source.cancel_at_period_end),
    plan_duration_days: Number(source.plan_duration_days ?? (tier === "free" ? 0 : 30)),
    auto_renew: Boolean(source.auto_renew),
    api_requests_today: Number(source.api_requests_today ?? 0),
    pro_requests_today: Number(source.pro_requests_today ?? 0),
    api_requests_reset_at: toOptionalString(source.api_requests_reset_at),
    pro_requests_reset_at: toOptionalString(source.pro_requests_reset_at),
    ecommerce_requests_today: Number(source.ecommerce_requests_today ?? 0),
    ecommerce_requests_reset_at: toOptionalString(source.ecommerce_requests_reset_at),
    builder_requests_today: Number(source.builder_requests_today ?? 0),
    builder_requests_reset_at: toOptionalString(source.builder_requests_reset_at),
    image_requests_today: Number(source.image_requests_today ?? 0),
    image_requests_reset_at: toOptionalString(source.image_requests_reset_at),
    voice_requests_today: Number(source.voice_requests_today ?? 0),
    voice_requests_reset_at: toOptionalString(source.voice_requests_reset_at),
    visits_today: Number(source.visits_today ?? 0),
    last_visit_date: typeof source.last_visit_date === "string" ? source.last_visit_date : nowDate,
    api_key: toOptionalString(source.api_key),
    last_login: toOptionalString(source.last_login),
    account_created_at: toOptionalString(source.account_created_at),
    created_at: toOptionalString(source.created_at) || nowIso,
    updated_at: toOptionalString(source.updated_at) || nowIso,
  };
}

export async function ensureUserSubscription(userId: string): Promise<UserSubscription> {
  try {
    const existing = await getUserSubscription(userId);
    if (existing) return existing;

    // Fetch user metadata from Firebase auth
    let fullName = "User";
    let email: string | null = null;
    let dateOfBirth: string | null = null;
    let country: string | null = null;
    let authProvider: string | null = null;

    try {
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        fullName = String(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User");
        email = user?.email || null;
        dateOfBirth = typeof user?.user_metadata?.date_of_birth === 'string' ? user.user_metadata.date_of_birth : null;
        country = typeof user?.user_metadata?.country === 'string' ? user.user_metadata.country : null;
        authProvider = typeof user?.user_metadata?.auth_provider === 'string' ? user.user_metadata.auth_provider : null;
      }
    } catch (authErr) {
      console.debug("Auth metadata fetch failed, will use Firebase mirror data", authErr);
    }

    const mirrorSnap = await getDoc(doc(firebaseDb, "users", userId));
    if (mirrorSnap.exists()) {
      const mirrorData = mirrorSnap.data() as Record<string, unknown>;
      const mirrorSubscription = buildSubscriptionFromMirror(userId, mirrorData, {
        fullName,
        email,
        dateOfBirth,
        country,
        authProvider,
      });

      await setDoc(doc(firebaseDb, "user_subscriptions", userId), mirrorSubscription, { merge: true });
      await setDoc(doc(firebaseDb, "users", userId), {
        user_id: mirrorSubscription.user_id,
        full_name: mirrorSubscription.full_name,
        email: mirrorSubscription.email,
        role: mirrorSubscription.role,
        tier: mirrorSubscription.tier,
        is_active: mirrorSubscription.is_active,
        is_banned: mirrorSubscription.is_banned,
        subscription_active: mirrorSubscription.subscription_active,
        auth_provider: mirrorSubscription.auth_provider || "firebase",
        date_of_birth: mirrorSubscription.date_of_birth || null,
        country: mirrorSubscription.country || null,
        account_created_at: mirrorSubscription.account_created_at || mirrorSubscription.created_at,
        created_at: mirrorSubscription.created_at,
        updated_at: mirrorSubscription.updated_at,
        last_login: mirrorSubscription.last_login,
      }, { merge: true });

      writeCache(subscriptionCache, userId, mirrorSubscription, SUBSCRIPTION_CACHE_TTL_MS);
      return mirrorSubscription;
    }

    const nowIso = new Date().toISOString();
    const nowDate = nowIso.split("T")[0];
    const created: UserSubscription = {
      id: userId,
      user_id: userId,
      role: "user",
      full_name: fullName,
      email: email || null,
      date_of_birth: dateOfBirth || null,
      country: country || null,
      auth_provider: authProvider || "firebase",
      tier: "free",
      is_active: true,
      is_banned: false,
      subscription_active: true,
      subscription_started_at: nowIso,
      subscription_expires_at: null,
      cancel_at_period_end: false,
      plan_duration_days: 0,
      auto_renew: false,
      api_requests_today: 0,
      pro_requests_today: 0,
      api_requests_reset_at: nowIso,
      pro_requests_reset_at: nowIso,
      ecommerce_requests_today: 0,
      ecommerce_requests_reset_at: nowIso,
      builder_requests_today: 0,
      builder_requests_reset_at: nowIso,
      image_requests_today: 0,
      image_requests_reset_at: nowIso,
      voice_requests_today: 0,
      voice_requests_reset_at: nowIso,
      visits_today: 1,
      last_visit_date: nowDate,
      api_key: null,
      last_login: null,
      account_created_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await setDoc(doc(firebaseDb, "user_subscriptions", userId), created, { merge: true });
    await setDoc(doc(firebaseDb, "users", userId), {
      user_id: created.user_id,
      full_name: created.full_name,
      email: created.email,
      role: created.role,
      tier: created.tier,
      is_active: created.is_active,
      is_banned: created.is_banned,
      subscription_active: created.subscription_active,
      auth_provider: created.auth_provider || "firebase",
      date_of_birth: created.date_of_birth || null,
      country: created.country || null,
      account_created_at: created.account_created_at || created.created_at,
      created_at: created.created_at,
      updated_at: created.updated_at,
      last_login: created.last_login,
    }, { merge: true });
    writeCache(subscriptionCache, userId, created, SUBSCRIPTION_CACHE_TTL_MS);
    return created;
  } catch (err) {
    if (isFirestorePermissionDenied(err)) {
      throw new Error("Firestore permission denied while creating user profile. Update Firestore rules to allow authenticated users to create user_subscriptions/{uid}.");
    }
    throw err;
  }
}

export async function getApiKeys(
  userId: string,
  options?: { forceRefresh?: boolean; throwOnError?: boolean }
): Promise<ApiKey[]> {
  const forceRefresh = options?.forceRefresh === true;
  const throwOnError = options?.throwOnError === true;
  if (!forceRefresh) {
    const cached = readCache(apiKeysCache, userId);
    if (cached) return cached;

    const inFlight = apiKeysInFlight.get(userId);
    if (inFlight) return inFlight;
  }

  const request = (async () => {
    try {
      const q = query(collection(firebaseDb, "api_keys"), where("user_id", "==", userId));
      const snap = await getDocs(q);
      const result = sortApiKeysByCreatedAtDesc(
        snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ApiKey, "id">) }))
      );
      writeCache(apiKeysCache, userId, result, API_KEYS_CACHE_TTL_MS);
      return result;
    } catch (err) {
      console.error("Critical error in getApiKeys:", err);
      if (throwOnError) {
        throw err;
      }
      return [];
    }
  })();

  if (!forceRefresh) {
    apiKeysInFlight.set(userId, request);
  }

  try {
    return await request;
  } finally {
    apiKeysInFlight.delete(userId);
  }
}

export async function generateApiKey(userId: string, name: string = "Main Key"): Promise<ApiKey | null> {
  try {
    const sub = await getUserSubscription(userId);
    if (!canManageApiForSubscription(sub)) return null;

    const features = getEffectiveFeatures(sub);

    // Check key limit
    const keys = await getApiKeys(userId);
    if (features.maxApiKeys !== -1 && keys.length >= features.maxApiKeys) {
      return null;
    }

    const keyString = `dlm_${crypto.randomUUID().replace(/-/g, "")}`;
    
    const nowIso = new Date().toISOString();
    const payload: Omit<ApiKey, "id"> = {
      user_id: userId,
      owner_name: sub?.full_name || null,
      owner_email: sub?.email || null,
      name,
      key: keyString,
      is_active: true,
      last_used_at: null,
      created_at: nowIso,
    };
    const created = await addDoc(collection(firebaseDb, "api_keys"), payload);
    const createdApiKey = { id: created.id, ...payload };
    const cachedKeys = readCache(apiKeysCache, userId);
    if (cachedKeys) {
      writeCache(apiKeysCache, userId, [createdApiKey, ...cachedKeys], API_KEYS_CACHE_TTL_MS);
    } else {
      invalidateApiKeysCache(userId);
    }
    return createdApiKey;
  } catch (err) {
    console.error("Critical error in generateApiKey:", err);
    return null;
  }
}

export async function toggleApiKey(keyId: string, isActive: boolean): Promise<boolean> {
  try {
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.id) return false;

    const sub = await getUserSubscription(user.id);
    if (!canManageApiForSubscription(sub)) return false;

    const keyDoc = await getDoc(doc(firebaseDb, "api_keys", keyId));
    if (!keyDoc.exists()) return false;
    const keyData = keyDoc.data() as Partial<ApiKey>;
    if (String(keyData.user_id || "") !== user.id) return false;

    await updateDoc(doc(firebaseDb, "api_keys", keyId), { is_active: isActive });
    patchApiKeyAcrossCaches(keyId, (k) => ({ ...k, is_active: isActive }));
    return true;
  } catch (err) {
    console.error("Critical error in toggleApiKey:", err);
    return false;
  }
}

export async function deleteApiKey(keyId: string): Promise<boolean> {
  try {
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.id) return false;

    const sub = await getUserSubscription(user.id);
    if (!canManageApiForSubscription(sub)) return false;

    const keyDoc = await getDoc(doc(firebaseDb, "api_keys", keyId));
    if (!keyDoc.exists()) return false;
    const keyData = keyDoc.data() as Partial<ApiKey>;
    if (String(keyData.user_id || "") !== user.id) return false;

    await deleteDoc(doc(firebaseDb, "api_keys", keyId));
    patchApiKeyAcrossCaches(keyId, () => null);
    return true;
  } catch (err) {
    console.error("Critical error in deleteApiKey:", err);
    return false;
  }
}

/**
 * Extends a user subscription by a given number of days.
 * This would typically be called by a payment webhook or backend process.
 */
export async function extendSubscription(userId: string, days: number, tier?: SubscriptionTier): Promise<boolean> {
  try {
    const sub = await getUserSubscription(userId, { forceRefresh: true });
    if (!sub) return false;

    const now = new Date();
    const currentExpiry = sub.subscription_expires_at ? new Date(sub.subscription_expires_at) : now;
    const baseDate = currentExpiry > now ? currentExpiry : now;
    
    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + days);

    const updated: Partial<UserSubscription> = {
      tier: tier || sub.tier,
      subscription_active: true,
      subscription_expires_at: newExpiry.toISOString(),
      subscription_started_at: sub.subscription_started_at || now.toISOString(),
      plan_duration_days: days,
      updated_at: new Date().toISOString(),
    };

    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), updated);
    invalidateSubscriptionCache(userId);
    return true;
  } catch (err) {
    console.error("Failed to extend subscription:", err);
    return false;
  }
}

/**
 * Cancels auto-renewal for a subscription.
 */
export async function setAutoRenew(userId: string, autoRenew: boolean): Promise<boolean> {
  try {
    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      auto_renew: autoRenew,
      cancel_at_period_end: !autoRenew,
      updated_at: new Date().toISOString(),
    });
    invalidateSubscriptionCache(userId);
    return true;
  } catch (err) {
    console.error("Failed to update auto-renew:", err);
    return false;
  }
}

export async function getApiKeyUsage(keyId: string, days: number = 7, fullApiKey?: string | null): Promise<any[]> {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const maskedKey = typeof fullApiKey === "string" && fullApiKey.startsWith("dlm_")
    ? `dlm_****${fullApiKey.slice(-4)}`
    : null;

  const normalizeAndFilter = (records: any[]) => {
    return records
      .filter((item) => {
        const createdAtMs = Date.parse(String(item?.created_at || ""));
        return Number.isFinite(createdAtMs) && createdAtMs >= sinceMs;
      })
      .sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  };

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const q = query(
      collection(firebaseDb, "api_usage_logs"),
      where("api_key_id", "==", keyId),
      where("created_at", ">=", since),
      orderBy("created_at", "asc")
    );
    const snap = await getDocs(q);
    return normalizeAndFilter(snap.docs.map((item) => item.data()));
  } catch (err) {
    console.warn("Primary api usage query failed, trying fallback path:", err);

    try {
      const fallbackQuery = query(
        collection(firebaseDb, "api_usage_logs"),
        where("api_key_id", "==", keyId),
        limit(500)
      );
      const fallbackSnap = await getDocs(fallbackQuery);
      const fallbackData = normalizeAndFilter(fallbackSnap.docs.map((item) => item.data()));
      if (fallbackData.length > 0 || !maskedKey) {
        return fallbackData;
      }

      // Legacy compatibility: older log records may not have api_key_id, only masked api_key.
      const legacyKeyQuery = query(
        collection(firebaseDb, "api_usage_logs"),
        where("api_key", "==", maskedKey),
        limit(500)
      );
      const legacySnap = await getDocs(legacyKeyQuery);
      return normalizeAndFilter(legacySnap.docs.map((item) => item.data()));
    } catch (fallbackErr) {
      console.error("Critical error in getApiKeyUsage fallback:", fallbackErr);
      return [];
    }
  }
}

export async function getApiUsageByUserId(userId: string, days: number = 365): Promise<any[]> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const q = query(
      collection(firebaseDb, "api_usage_logs"),
      where("user_id", "==", userId),
      where("created_at", ">=", since)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((item) => item.data())
      .sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  } catch (err) {
    console.error("Critical error in getApiUsageByUserId:", err);
    return [];
  }
}

export async function trackApiUsage(userId: string, apiKeyId: string | null, apiKey: string | null, endpoint: string, method: string, status: number) {
  try {
    const maskedKey = apiKey ? `dlm_****${apiKey.slice(-4)}` : null;
    await addDoc(collection(firebaseDb, "api_usage_logs"), {
      user_id: userId,
      api_key_id: apiKeyId,
      api_key: maskedKey,
      endpoint,
      method,
      status_code: status,
      created_at: new Date().toISOString(),
      created_at_ts: Timestamp.now(),
    });

    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      api_requests_today: increment(1),
      api_requests_reset_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const cachedSub = readCache(subscriptionCache, userId);
    if (cachedSub) {
      const patched: UserSubscription = {
        ...cachedSub,
        api_requests_today: Number(cachedSub.api_requests_today || 0) + 1,
        api_requests_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
    }
  } catch (err) {
    console.error("Critical error in trackApiUsage:", err);
  }
}

export async function trackProUsage(userId: string) {
  try {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      pro_requests_today: increment(1),
      pro_requests_reset_at: nowIso,
      updated_at: nowIso,
    });

    const cachedSub = readCache(subscriptionCache, userId);
    if (cachedSub) {
      const patched: UserSubscription = {
        ...cachedSub,
        pro_requests_today: Number(cachedSub.pro_requests_today || 0) + 1,
        pro_requests_reset_at: nowIso,
        updated_at: nowIso,
      };
      writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
    }
  } catch (err) {
    console.error("Critical error in trackProUsage:", err);
  }
}

export async function trackEcommerceUsage(userId: string) {
  try {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      ecommerce_requests_today: increment(1),
      ecommerce_requests_reset_at: nowIso,
      updated_at: nowIso,
    });

    const cachedSub = readCache(subscriptionCache, userId);
    if (cachedSub) {
      const patched: UserSubscription = {
        ...cachedSub,
        ecommerce_requests_today: Number(cachedSub.ecommerce_requests_today || 0) + 1,
        ecommerce_requests_reset_at: nowIso,
        updated_at: nowIso,
      };
      writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
    }
  } catch (err) {
    console.error("Critical error in trackEcommerceUsage:", err);
  }
}

export async function trackVoiceUsage(userId: string) {
  try {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      voice_requests_today: increment(1),
      voice_requests_reset_at: nowIso,
      updated_at: nowIso,
    });

    const cachedSub = readCache(subscriptionCache, userId);
    if (cachedSub) {
      const patched: UserSubscription = {
        ...cachedSub,
        voice_requests_today: Number(cachedSub.voice_requests_today || 0) + 1,
        voice_requests_reset_at: nowIso,
        updated_at: nowIso,
      };
      writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
    }
  } catch (err) {
    console.error("Critical error in trackVoiceUsage:", err);
  }
}

export async function trackImageUsage(userId: string) {
  try {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      image_requests_today: increment(1),
      image_requests_reset_at: nowIso,
      updated_at: nowIso,
    });

    const cachedSub = readCache(subscriptionCache, userId);
    if (cachedSub) {
      const patched: UserSubscription = {
        ...cachedSub,
        image_requests_today: Number(cachedSub.image_requests_today || 0) + 1,
        image_requests_reset_at: nowIso,
        updated_at: nowIso,
      };
      writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
    }
  } catch (err) {
    console.error("Critical error in trackImageUsage:", err);
  }
}

export async function trackBuilderUsage(userId: string) {
  try {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      builder_requests_today: increment(1),
      builder_requests_reset_at: nowIso,
      updated_at: nowIso,
    });

    const cachedSub = readCache(subscriptionCache, userId);
    if (cachedSub) {
      const patched: UserSubscription = {
        ...cachedSub,
        builder_requests_today: Number(cachedSub.builder_requests_today || 0) + 1,
        builder_requests_reset_at: nowIso,
        updated_at: nowIso,
      };
      writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);
    }
  } catch (err) {
    console.error("Critical error in trackBuilderUsage:", err);
  }
}

export async function trackVisit(userId: string): Promise<{ isNewDay: boolean; visitsToday: number }> {
  const nowIso = new Date().toISOString();
  
  // Format local date as YYYY-MM-DD to avoid timezone drift
  const today = new Date();
  const nowDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  let isNewDay = false;
  let visitsToday = 0;

  try {
    let sub = readCache(subscriptionCache, userId);
    
    if (!sub) {
      sub = await getUserSubscription(userId, { forceRefresh: true });
    }

    if (!sub) {
      return { isNewDay: false, visitsToday: 0 };
    }

    const currentVisits = Number(sub.visits_today ?? 0);
    const lastVisitDate = typeof sub.last_visit_date === "string" ? sub.last_visit_date : null;
    
    if (!isSameDay(lastVisitDate)) {
      isNewDay = true;
      visitsToday = 1;
    } else {
      visitsToday = currentVisits + 1;
    }

    await updateDoc(doc(firebaseDb, "user_subscriptions", userId), {
      visits_today: isNewDay ? 1 : increment(1),
      last_visit_date: nowDate,
      updated_at: nowIso,
    });

    const patched: UserSubscription = {
      ...sub,
      visits_today: visitsToday,
      last_visit_date: nowDate,
      updated_at: nowIso,
    };
    writeCache(subscriptionCache, userId, patched, SUBSCRIPTION_CACHE_TTL_MS);

  } catch (err) {
    console.error("Critical error in trackVisit:", err);
  }

  return { isNewDay, visitsToday };
}

/**
 * Validates a user API key and verifies tier/rate eligibility for public API usage.
 */
export async function validateUserApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  const normalized = String(apiKey || "").trim();
  if (!normalized || !normalized.startsWith("dlm_")) {
    return { ok: false, status: 401, message: "Invalid API key format" };
  }

  try {
    const keyQuery = query(
      collection(firebaseDb, "api_keys"),
      where("key", "==", normalized),
      where("is_active", "==", true),
      limit(1)
    );
    const keySnap = await getDocs(keyQuery);
    const keyDoc = keySnap.docs[0];
    if (!keyDoc) {
      return { ok: false, status: 401, message: "API key not found or disabled" };
    }

    const keyData = keyDoc.data() as Partial<ApiKey>;
    const userId = String(keyData.user_id || "");
    if (!userId) {
      return { ok: false, status: 401, message: "API key owner is invalid" };
    }

    const sub = await getUserSubscription(userId, { forceRefresh: true });
    if (!sub) {
      return { ok: false, status: 401, message: "Subscription record not found" };
    }

    const normalizedSub = await maybeResetDailyUsage(userId, sub);
    const features = getEffectiveFeatures(normalizedSub);

    if (!isPaidActivated || !features.canGenerateApiKey) {
      return { ok: false, status: 402, message: "API access is not available for this plan", userId, keyId: keyDoc.id, tier: normalizedSub.tier };
    }

    if (!isSubscriptionActiveForApi(normalizedSub)) {
      return { ok: false, status: 402, message: "Subscription is inactive", userId, keyId: keyDoc.id, tier: normalizedSub.tier };
    }

    if (features.maxApiRequestsPerDay !== -1 && normalizedSub.api_requests_today >= features.maxApiRequestsPerDay) {
      return {
        ok: false,
        status: 429,
        message: `Daily API limit reached for ${normalizedSub.tier} tier (${features.maxApiRequestsPerDay} requests)`,
        userId,
        keyId: keyDoc.id,
        tier: normalizedSub.tier,
      };
    }

    return {
      ok: true,
      status: 200,
      message: "API key validated",
      userId,
      keyId: keyDoc.id,
      tier: normalizedSub.tier,
    };
  } catch (err) {
    console.error("Critical error in validateUserApiKey:", err);
    return { ok: false, status: 500, message: "Internal API key validation error" };
  }
}

/**
 * Deactivates all API keys for a user when subscription expires or is downgraded.
 * This ensures API keys can't be used without an active subscription.
 */
export async function deactivateApiKeysForUser(userId: string, reason: "expired" | "downgraded" | "cancelled"): Promise<number> {
  try {
    const keys = await getApiKeys(userId);
    let deactivatedCount = 0;

    for (const key of keys) {
      if (key.is_active) {
        await updateDoc(doc(firebaseDb, "api_keys", key.id), {
          is_active: false,
        });
        patchApiKeyAcrossCaches(key.id, (k) => ({ ...k, is_active: false }));
        deactivatedCount++;
      }
    }

    if (deactivatedCount > 0) {
      console.info(`[Subscription] Deactivated ${deactivatedCount} API keys for user ${userId} (reason: ${reason})`);
    }

    return deactivatedCount;
  } catch (err) {
    console.error("Critical error in deactivateApiKeysForUser:", err);
    return 0;
  }
}

/**
 * Checks and handles subscription expiration.
 * Deactivates API keys if subscription has expired.
 */
export async function checkAndHandleSubscriptionExpiration(userId: string): Promise<{
  isExpired: boolean;
  wasDeactivated: boolean;
  deactivatedCount: number;
}> {
  try {
    const sub = await getUserSubscription(userId, { forceRefresh: true });
    
    if (!sub) {
      return { isExpired: false, wasDeactivated: false, deactivatedCount: 0 };
    }

    const isExpired = !isSubscriptionActiveForApi(sub);
    const hasApiKeys = !!(sub.tier !== "free" && getEffectiveFeatures(sub).canGenerateApiKey);

    if (isExpired && hasApiKeys) {
      const deactivatedCount = await deactivateApiKeysForUser(userId, "expired");
      return { isExpired: true, wasDeactivated: true, deactivatedCount };
    }

    return { isExpired, wasDeactivated: false, deactivatedCount: 0 };
  } catch (err) {
    console.error("Critical error in checkAndHandleSubscriptionExpiration:", err);
    return { isExpired: false, wasDeactivated: false, deactivatedCount: 0 };
  }
}

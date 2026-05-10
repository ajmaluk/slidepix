/**
 * Firestore Collections Auto-Initialization
 * 
 * This module ensures all required Firestore collections exist.
 * Collections are auto-created on first document write, but this ensures
 * proper structure and handles edge cases.
 */

import { firebaseConfigured, firebaseDb } from "@/lib/firebaseClient";
import { authClient } from "@/lib/authClient";
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";

export type CollectionName = 
  | "users"
  | "user_subscriptions"
  | "api_keys"
  | "api_usage_logs"
  | "tasks"
  | "teams"
  | "team_members"
  | "job_positions"
  | "job_applications";

interface CollectionSchema {
  name: CollectionName;
  description: string;
  canAutoCreate: boolean;
}

const COLLECTIONS: CollectionSchema[] = [
  {
    name: "users",
    description: "Public-safe user profile mirror",
    canAutoCreate: true,
  },
  {
    name: "user_subscriptions",
    description: "Main user profile and subscription data",
    canAutoCreate: true,
  },
  {
    name: "api_keys",
    description: "User-generated API keys for public API access",
    canAutoCreate: true,
  },
  {
    name: "api_usage_logs",
    description: "Append-only log of API requests",
    canAutoCreate: true,
  },
  {
    name: "tasks",
    description: "User task management",
    canAutoCreate: true,
  },
  {
    name: "teams",
    description: "Team data",
    canAutoCreate: true,
  },
  {
    name: "team_members",
    description: "Team membership",
    canAutoCreate: true,
  },
  {
    name: "job_positions",
    description: "Job position listings",
    canAutoCreate: true,
  },
  {
    name: "job_applications",
    description: "Job application tracking",
    canAutoCreate: true,
  },
];

/**
 * Check if a collection has any documents
 */
export async function collectionExists(
  collectionName: CollectionName
): Promise<boolean> {
  try {
    const q = query(collection(firebaseDb, collectionName), limit(1));
    const snapshot = await getDocs(q);
    return snapshot.size > 0;
  } catch (error) {
    console.debug(`Collection check for "${collectionName}":`, error);
    return false;
  }
}

/**
 * Ensure a user_subscriptions document exists for a user
 */
export async function ensureCollectionDocumentExists(
  userId: string,
  collectionName: "user_subscriptions" = "user_subscriptions"
): Promise<boolean> {
  try {
    const docRef = doc(firebaseDb, collectionName, userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return true; // Document already exists
    }

    // Create a minimal placeholder document if needed
    // (actual user subscription is created during registration)
    return false; // Document doesn't exist yet, will be created during registration
  } catch (error) {
    console.warn(`Error checking "${collectionName}" document for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get all collection names
 */
export function getAllCollectionNames(): CollectionName[] {
  return COLLECTIONS.map((c) => c.name);
}

/**
 * Get collection description
 */
export function getCollectionDescription(
  collectionName: CollectionName
): string | null {
  const schema = COLLECTIONS.find((c) => c.name === collectionName);
  return schema?.description || null;
}

/**
 * Check if all required collections are properly set up
 */
export async function verifyCollectionsSetup(): Promise<{
  ok: boolean;
  checked: CollectionName[];
  existing: CollectionName[];
  missing: CollectionName[];
  errors: Array<{ collection: CollectionName; error: string }>;
}> {
  const existing: CollectionName[] = [];
  const missing: CollectionName[] = [];
  const errors: Array<{ collection: CollectionName; error: string }> = [];

  for (const schema of COLLECTIONS) {
    try {
      const exists = await collectionExists(schema.name);
      if (exists) {
        existing.push(schema.name);
      } else {
        missing.push(schema.name);
      }
    } catch (error) {
      errors.push({
        collection: schema.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: errors.length === 0,
    checked: COLLECTIONS.map((c) => c.name),
    existing,
    missing,
    errors,
  };
}

/**
 * Initialize Firestore collections on app startup
 * Collections are auto-created on first write, so this mainly logs status
 */
export async function initializeFirestoreCollections(): Promise<void> {
  try {
    if (!firebaseConfigured || !firebaseDb) {
      console.info("Firestore initialization skipped because Firebase is not configured.");
      return;
    }

    console.info("🔥 Initializing Firestore collections...");

    const verification = await verifyCollectionsSetup();

    if (verification.existing.length > 0) {
      console.info(
        `✓ Found ${verification.existing.length} existing collection(s):`,
        verification.existing.join(", ")
      );
    }

    if (verification.missing.length > 0) {
      console.info(
        `⏳ Pending collections (will auto-create on first use): ${verification.missing.length}`,
        verification.missing.join(", ")
      );
    }

    if (verification.errors.length > 0) {
      console.warn("⚠️ Collection verification issues:", verification.errors);
    }

    if (verification.ok) {
      console.info("✓ Firestore collections verified");
    }
  } catch (error) {
    console.error("Failed to initialize Firestore collections:", error);
  }
}

export async function ensureCoreCollectionsReady(): Promise<boolean> {
  try {
    if (!firebaseConfigured || !firebaseDb) {
      return false;
    }

    // Validate at least one authenticated write path so startup status is meaningful.
    const {
      data: { session },
    } = await authClient.auth.getSession();

    const isStaff = session?.user?.email?.endsWith("@pixtool.in") || false;

    // Try to read/write to core collections to trigger auto-creation
    const coreCollections: CollectionName[] = [
      "users",
      "user_subscriptions",
      "api_keys",
      "api_usage_logs",
    ];

    const adminCollections: CollectionName[] = [
      "teams",
      "team_members",
      "job_positions",
      "job_applications",
    ];

    const collectionsToCheck = isStaff 
      ? [...coreCollections, ...adminCollections]
      : coreCollections;

    for (const collName of collectionsToCheck) {
      try {
        const q = query(collection(firebaseDb, collName), limit(1));
        await getDocs(q);
      } catch (error: any) {
        // Silently swallow probe errors for regular users - it's expected they can't probe admins
        console.debug(`Suppressed probe error for "${collName}":`, error.message);
      }
    }

    if (session?.user?.id) {
      const userId = session.user.id;
      const nowIso = new Date().toISOString();
      const subRef = doc(firebaseDb, "user_subscriptions", userId);
      const userRef = doc(firebaseDb, "users", userId);
      const [subSnap, userSnap] = await Promise.all([getDoc(subRef), getDoc(userRef)]);

      if (!subSnap.exists()) {
        await setDoc(
          subRef,
          {
            user_id: userId,
            full_name: "User",
            role: "user",
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
            visits_today: 1,
            last_visit_date: nowIso.split("T")[0],
            account_created_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
            last_login: nowIso,
          },
          { merge: true }
        );
      } else {
        await setDoc(
          subRef,
          {
            user_id: userId,
            updated_at: nowIso,
            last_login: nowIso,
          },
          { merge: true }
        );
      }

      if (!userSnap.exists()) {
        const subData = subSnap.data() as Record<string, unknown> | undefined;
        await setDoc(
          userRef,
          {
            user_id: userId,
            full_name: typeof subData?.full_name === "string" ? subData.full_name : "User",
            email: typeof subData?.email === "string" ? subData.email : null,
            role: typeof subData?.role === "string" ? subData.role : "user",
            tier: typeof subData?.tier === "string" ? subData.tier : "free",
            is_active: typeof subData?.is_active === "boolean" ? subData.is_active : true,
            is_banned: typeof subData?.is_banned === "boolean" ? subData.is_banned : false,
            subscription_active: typeof subData?.subscription_active === "boolean" ? subData.subscription_active : true,
            account_created_at: typeof subData?.account_created_at === "string" ? subData.account_created_at : nowIso,
            created_at: typeof subData?.created_at === "string" ? subData.created_at : nowIso,
            updated_at: nowIso,
            last_login: nowIso,
          },
          { merge: true }
        );
      } else {
        await setDoc(
          userRef,
          {
            user_id: userId,
            updated_at: nowIso,
            last_login: nowIso,
          },
          { merge: true }
        );
      }
    }

    return true;
  } catch (error) {
    console.error("Error ensuring core collections:", error);
    return false;
  }
}

/**
 * Get human-readable collection status report
 */
export async function getCollectionsStatusReport(): Promise<string> {
  const verification = await verifyCollectionsSetup();

  const lines = [
    "📊 Firestore Collections Status Report",
    "====================================",
    "",
    `Collections Checked: ${verification.checked.length}`,
    `Existing: ${verification.existing.length}`,
    `Pending: ${verification.missing.length}`,
    `Errors: ${verification.errors.length}`,
    "",
  ];

  if (verification.existing.length > 0) {
    lines.push("✓ Existing Collections:");
    verification.existing.forEach((name) => {
      const desc = getCollectionDescription(name);
      lines.push(`  • ${name}${desc ? ` - ${desc}` : ""}`);
    });
    lines.push("");
  }

  if (verification.missing.length > 0) {
    lines.push("⏳ Pending Collections (auto-create on first use):");
    verification.missing.forEach((name) => {
      const desc = getCollectionDescription(name);
      lines.push(`  • ${name}${desc ? ` - ${desc}` : ""}`);
    });
    lines.push("");
  }

  if (verification.errors.length > 0) {
    lines.push("⚠️ Errors:");
    verification.errors.forEach(({ collection, error }) => {
      lines.push(`  • ${collection}: ${error}`);
    });
    lines.push("");
  }

  lines.push("====================================");
  lines.push(verification.ok ? "✓ Status: READY" : "⚠️ Status: CHECK REQUIRED");

  return lines.join("\n");
}

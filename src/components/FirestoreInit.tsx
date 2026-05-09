/**
 * Firestore Collections Initializer
 * Runs on app startup to ensure all collections are properly set up
 */

import { useEffect, useRef } from "react";
import { initializeFirestoreCollections, ensureCoreCollectionsReady } from "@/lib/firestoreInit";

export default function FirestoreInit() {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        // Initialize Firestore collections on app startup
        await initializeFirestoreCollections();

        // Ensure core collections are ready
        const coreReady = await ensureCoreCollectionsReady();
        if (coreReady) {
          console.info("✓ Firestore core collections ready");
        } else {
          console.warn("⚠️ Firestore core collections may not be fully ready");
        }
      } catch (error) {
        console.error("Firestore initialization error:", error);
      }
    };

    init();
  }, []);

  return null;
}

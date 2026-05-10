import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

import { getEnv } from "./env";
import { isDev } from "./env";

const firebaseConfig = {
  apiKey: getEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const hasFirebaseConfig = Object.values(firebaseConfig).every((value) => typeof value === "string" && value.trim().length > 0);

const app = hasFirebaseConfig ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : null;

if (isDev() && hasFirebaseConfig) {
  console.log("Firebase initialized for project:", firebaseConfig.projectId);
}

if (isDev() && !hasFirebaseConfig) {
  console.warn("Firebase env vars are missing; Firebase features will stay disabled.");
}

export const firebaseConfigured = hasFirebaseConfig;
export const firebaseDb = (app ? getFirestore(app) : null) as ReturnType<typeof getFirestore> | null;

// Analytics initialization (safe for SSR/restricted environments)
export const firebaseAnalytics = app ? isSupported().then((yes) => (yes ? getAnalytics(app) : null)) : Promise.resolve(null);

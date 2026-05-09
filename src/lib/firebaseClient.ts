import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

import { getEnv } from "./env";

function readRequiredEnvVar(key: string) {
  const value = getEnv(key);
  if (!value) {
    // If we're in a test or non-browser environment, don't throw if just verifying logic
    if (typeof window === "undefined") return "mock-value";
    throw new Error(`Missing required Firebase environment variable: ${key}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: readRequiredEnvVar("VITE_FIREBASE_API_KEY"),
  authDomain: readRequiredEnvVar("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readRequiredEnvVar("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readRequiredEnvVar("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readRequiredEnvVar("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readRequiredEnvVar("VITE_FIREBASE_APP_ID"),
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

import { isDev } from "./env";
if (isDev()) {
  console.log("Firebase initialized for project:", firebaseConfig.projectId);
}

export const firebaseDb = getFirestore(app);

// Analytics initialization (safe for SSR/restricted environments)
export const firebaseAnalytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

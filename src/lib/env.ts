import { z } from "zod";

const envKeys = [
  "BASE_URL",
  "DEV",
  "MODE",
  "NODE_ENV",
  "PROD",
  "SSR",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_GEMINI_API_KEYS",
  "VITE_GITHUB_TOKEN",
  "VITE_GROQ_API_KEYS",
  "VITE_HTTPS_PROXY",
  "VITE_NVIDIA_API_KEYS",
  "VITE_OPENROUTER_API_KEYS",
  "VITE_SITE_URL",
  "VITE_UNSPLASH_ACCESS_KEY",
] as const;

type EnvKey = (typeof envKeys)[number];

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}, z.boolean().optional());

const envSchema = z.object({
  BASE_URL: optionalString,
  DEV: optionalBoolean,
  MODE: optionalString,
  NODE_ENV: optionalString,
  PROD: optionalBoolean,
  SSR: optionalBoolean,
  VITE_FIREBASE_APP_ID: optionalString,
  VITE_FIREBASE_API_KEY: optionalString,
  VITE_FIREBASE_AUTH_DOMAIN: optionalString,
  VITE_FIREBASE_MESSAGING_SENDER_ID: optionalString,
  VITE_FIREBASE_PROJECT_ID: optionalString,
  VITE_FIREBASE_STORAGE_BUCKET: optionalString,
  VITE_GEMINI_API_KEYS: optionalString,
  VITE_GITHUB_TOKEN: optionalString,
  VITE_GROQ_API_KEYS: optionalString,
  VITE_HTTPS_PROXY: optionalString,
  VITE_NVIDIA_API_KEYS: optionalString,
  VITE_OPENROUTER_API_KEYS: optionalString,
  VITE_SITE_URL: optionalString,
  VITE_UNSPLASH_ACCESS_KEY: optionalString,
}).strict();

function readEnvValue(key: EnvKey): unknown {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  if (viteEnv && Object.prototype.hasOwnProperty.call(viteEnv, key)) {
    return viteEnv[key];
  }

  if (typeof process !== "undefined" && process.env && Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }

  return undefined;
}

const rawEnv = Object.fromEntries(envKeys.map((key) => [key, readEnvValue(key)])) as Record<EnvKey, unknown>;

if (typeof rawEnv.MODE !== "string" && typeof rawEnv.NODE_ENV === "string") {
  rawEnv.MODE = rawEnv.NODE_ENV;
}

if (typeof rawEnv.NODE_ENV !== "string" && typeof rawEnv.MODE === "string") {
  rawEnv.NODE_ENV = rawEnv.MODE;
}

if (rawEnv.DEV === undefined && (typeof rawEnv.MODE === "string" || typeof rawEnv.NODE_ENV === "string")) {
  rawEnv.DEV = rawEnv.MODE === "development" || rawEnv.NODE_ENV === "development";
}

if (rawEnv.PROD === undefined && (typeof rawEnv.MODE === "string" || typeof rawEnv.NODE_ENV === "string")) {
  rawEnv.PROD = rawEnv.MODE === "production" || rawEnv.NODE_ENV === "production";
}

const parsedEnv = envSchema.safeParse(rawEnv);
if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

export const config = parsedEnv.data;
export type Config = typeof config;

export function getEnv(key: string, fallback = ""): string {
  const value = config[key as keyof Config];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export const isDev = (): boolean => {
  if (typeof config.DEV === "boolean") return config.DEV;
  if (config.MODE) return config.MODE === "development";
  if (config.NODE_ENV) return config.NODE_ENV === "development";
  return false;
};

export const isProd = (): boolean => {
  if (typeof config.PROD === "boolean") return config.PROD;
  if (config.MODE) return config.MODE === "production";
  if (config.NODE_ENV) return config.NODE_ENV === "production";
  return true;
};

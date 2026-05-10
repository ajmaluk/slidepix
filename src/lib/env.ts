import { z } from "zod";

const envKeys = [
  "NODE_ENV",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "GEMINI_API_KEYS",
  "GITHUB_TOKEN",
  "GROQ_API_KEYS",
  "PROVIDER_ROTATION_PASSES",
  "PROVIDER_ATTEMPT_TIMEOUT_MS",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NVIDIA_API_KEYS",
  "OPENROUTER_API_KEYS",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_UNSPLASH_ACCESS_KEY",
] as const;

type EnvKey = (typeof envKeys)[number];

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const envSchema = z.object({
  NODE_ENV: optionalString,
  NEXT_PUBLIC_FIREBASE_APP_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_API_KEY: optionalString,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: optionalString,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: optionalString,
  GEMINI_API_KEYS: optionalString,
  GITHUB_TOKEN: optionalString,
  GROQ_API_KEYS: optionalString,
  PROVIDER_ROTATION_PASSES: optionalString,
  PROVIDER_ATTEMPT_TIMEOUT_MS: optionalString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  CLERK_SECRET_KEY: optionalString,
  NVIDIA_API_KEYS: optionalString,
  OPENROUTER_API_KEYS: optionalString,
  NEXT_PUBLIC_SITE_URL: optionalString,
  NEXT_PUBLIC_UNSPLASH_ACCESS_KEY: optionalString,
}).strict();

function readEnvValue(key: EnvKey): unknown {
  // Next.js reads from process.env primarily
  if (typeof process !== "undefined" && process.env && Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }

  return undefined;
}

const rawEnv = Object.fromEntries(envKeys.map((key) => [key, readEnvValue(key)])) as Record<EnvKey, unknown>;

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
  return config.NODE_ENV === "development";
};

export const isProd = (): boolean => {
  return config.NODE_ENV === "production";
};

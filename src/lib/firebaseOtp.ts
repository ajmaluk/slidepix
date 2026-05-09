import type { RegistrationInput } from "@/lib/validation";
import { getEnv } from "./env";

type PendingSignupRecord = {
  email: string;
  password: string;
  date_of_birth: string;
  country: string;
  otpHash: string;
  expiresAt: number;
};

type PendingForgotPasswordRecord = {
  email: string;
  otpHash: string;
  expiresAt: number;
};

type VerifyAttemptRecord = {
  count: number;
  windowStart: number;
  lockUntil: number;
};

const OTP_TTL_MS = 15 * 60 * 1000;
const PENDING_SIGNUP_KEY = "firebase_pending_signup_v1";
const PENDING_FORGOT_PASSWORD_KEY = "firebase_pending_forgot_password_v1";
const OTP_ATTEMPTS_PREFIX = "firebase_otp_attempts_v1";
const OTP_VERIFY_WINDOW_MS = 5 * 60 * 1000;
const OTP_VERIFY_MAX_ATTEMPTS = 5;
const OTP_VERIFY_LOCK_MS = 15 * 60 * 1000;

function readRuntimeEnvOverride(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;

  const runtimeEnv = (window as any).__DALAM_RUNTIME_ENV__;
  if (!runtimeEnv || typeof runtimeEnv !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(runtimeEnv, key)) return undefined;

  const value = runtimeEnv[key];
  return typeof value === "string" ? value.trim() : "";
}

function readClientEnvVar(key: string): string {
  const runtimeValue = readRuntimeEnvOverride(key);
  if (runtimeValue !== undefined) {
    return runtimeValue;
  }

  const rawValue = getEnv(key);
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function generateOtpCode() {
  const value = Math.floor(Math.random() * 1000000);
  return value.toString().padStart(6, "0");
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getOtpEndpoint() {
  const endpoint = readClientEnvVar("VITE_OTP_EMAIL_ENDPOINT");
  if (endpoint) {
    return {
      type: "backend" as const,
      url: endpoint,
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  return {
    type: "backend" as const,
    url: "/v1/api/otp-email", // Fallback to your primary Firebase Edge Function or custom endpoint
    headers: {
      "Content-Type": "application/json",
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function otpEmailTemplate(email: string, code: string, purpose: "signup" | "password_reset") {
  const safeEmail = escapeHtml(email);
  const safeCode = escapeHtml(code);
  const heading = purpose === "signup" ? "Verify your email" : "Reset your password";
  const message =
    purpose === "signup"
      ? "Welcome. Verify your email address to complete your account registration."
      : "We received a password reset request. Enter this code to continue.";

  const safeMessage = escapeHtml(message);
  const expiryNote = "This code expires in 15 minutes";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${heading}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #080b12;
      color: #e2e8f0;
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    }
    .outer {
      max-width: 600px;
      margin: 0 auto;
      padding: 28px 14px;
    }
    .card {
      background: linear-gradient(180deg, rgba(16, 20, 30, 0.98) 0%, rgba(10, 13, 22, 0.98) 100%);
      border: 1px solid #1f2937;
      border-radius: 18px;
      box-shadow: 0 22px 50px rgba(0, 0, 0, 0.42);
      overflow: hidden;
    }
    .orb-band {
      height: 6px;
      background: linear-gradient(90deg, #22d3ee 0%, #4f46e5 48%, #db2777 100%);
    }
    .content {
      padding: 28px 22px 24px;
      text-align: center;
    }
    .orb {
      width: 54px;
      height: 54px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background:
        radial-gradient(circle at 28% 28%, #93c5fd 0%, #60a5fa 26%, rgba(96, 165, 250, 0) 44%),
        radial-gradient(circle at 70% 36%, #a78bfa 0%, #8b5cf6 34%, rgba(139, 92, 246, 0) 55%),
        radial-gradient(circle at 54% 72%, #f472b6 0%, #db2777 34%, rgba(219, 39, 119, 0) 56%),
        #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 0 22px rgba(99, 102, 241, 0.35);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 26px;
      font-weight: 700;
      color: #f8fafc;
    }
    .copy {
      margin: 0 auto 16px;
      max-width: 480px;
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
    }
    .code-box {
      margin: 0 auto;
      max-width: 420px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 18px 14px;
    }
    .code-label {
      margin-bottom: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-weight: 600;
      color: #7dd3fc;
    }
    .code {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 0.22em;
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .security {
      margin: 14px auto 0;
      max-width: 420px;
      text-align: left;
      border: 1px solid #374151;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.5;
      color: #9ca3af;
    }
    .footer {
      margin-top: 16px;
      font-size: 11px;
      line-height: 1.6;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="outer">
    <div class="card">
      <div class="orb-band"></div>
      <div class="content">
        <div class="orb" aria-hidden="true"></div>

        <h1>${heading}</h1>
        <p class="copy">${safeMessage}</p>

        <div class="code-box">
          <div class="code-label">Verification code</div>
          <div class="code">${safeCode}</div>
        </div>

        <div class="security">
          <strong>Security tip:</strong> Never share this code with anyone. We will never ask for it by email or phone.
        </div>

        <div class="footer">
          <div>${expiryNote}.</div>
          <div>If you did not request this, you can ignore this email.</div>
          <div>Sent to: ${safeEmail}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function sendOtpEmail(email: string, code: string, purpose: "signup" | "password_reset") {
  const endpoint = getOtpEndpoint();
  const subject = purpose === "signup" ? "Verify your email - Complete signup" : "Reset your password - Verification code";

  const recipient = email;
  const body = {
    to: recipient,
    subject,
    text: `Your verification code is ${code}. It expires in 15 minutes.`,
    html: otpEmailTemplate(recipient, code, purpose),
  };

  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: "POST",
      headers: endpoint.headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach OTP email service. Check VITE_OTP_EMAIL_ENDPOINT or dev proxy configuration.");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown email provider error");
    if (response.status === 403 && text.includes("You can only send testing emails to your own email address")) {
      if (!import.meta.env.PROD) {
        // Local/dev fallback: keep OTP flows testable even when Resend sandbox blocks recipient delivery.
        console.warn("Resend sandbox restriction hit; using development OTP fallback.");
        console.info(`DEV OTP (${purpose}) for ${email}: ${code}`);
        return recipient;
      }
      throw new Error(
        "Resend sandbox restriction: verify a domain at resend.com/domains and use that domain in VITE_RESEND_FROM_EMAIL, " +
          "then retry OTP delivery."
      );
    }
    throw new Error(`Unable to send OTP email (${response.status}): ${text}`);
  }

  return recipient;
}

function setPendingSignup(record: PendingSignupRecord) {
  sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(record));
}

function setPendingForgotPassword(record: PendingForgotPasswordRecord) {
  sessionStorage.setItem(PENDING_FORGOT_PASSWORD_KEY, JSON.stringify(record));
}

function getPendingSignup() {
  const raw = sessionStorage.getItem(PENDING_SIGNUP_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingSignupRecord;
    if (!parsed?.email || !parsed?.otpHash || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getPendingForgotPassword() {
  const raw = sessionStorage.getItem(PENDING_FORGOT_PASSWORD_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingForgotPasswordRecord;
    if (!parsed?.email || !parsed?.otpHash || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function attemptsStorageKey(scope: "signup" | "forgot", email: string) {
  return `${OTP_ATTEMPTS_PREFIX}:${scope}:${email}`;
}

function readAttemptRecord(scope: "signup" | "forgot", email: string): VerifyAttemptRecord {
  const raw = sessionStorage.getItem(attemptsStorageKey(scope, email));
  if (!raw) {
    return { count: 0, windowStart: Date.now(), lockUntil: 0 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VerifyAttemptRecord>;
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      windowStart: typeof parsed.windowStart === "number" ? parsed.windowStart : Date.now(),
      lockUntil: typeof parsed.lockUntil === "number" ? parsed.lockUntil : 0,
    };
  } catch {
    return { count: 0, windowStart: Date.now(), lockUntil: 0 };
  }
}

function writeAttemptRecord(scope: "signup" | "forgot", email: string, record: VerifyAttemptRecord) {
  sessionStorage.setItem(attemptsStorageKey(scope, email), JSON.stringify(record));
}

function clearAttemptRecord(scope: "signup" | "forgot", email: string) {
  sessionStorage.removeItem(attemptsStorageKey(scope, email));
}

function assertOtpAllowed(scope: "signup" | "forgot", email: string) {
  const now = Date.now();
  const record = readAttemptRecord(scope, email);

  if (record.lockUntil > now) {
    const retrySeconds = Math.ceil((record.lockUntil - now) / 1000);
    throw new Error(`Too many attempts. Try again in ${retrySeconds} seconds.`);
  }

  if (now - record.windowStart > OTP_VERIFY_WINDOW_MS) {
    writeAttemptRecord(scope, email, { count: 0, windowStart: now, lockUntil: 0 });
  }
}

function recordOtpFailure(scope: "signup" | "forgot", email: string) {
  const now = Date.now();
  const record = readAttemptRecord(scope, email);
  const isSameWindow = now - record.windowStart <= OTP_VERIFY_WINDOW_MS;

  const nextCount = isSameWindow ? record.count + 1 : 1;
  const nextWindowStart = isSameWindow ? record.windowStart : now;
  const shouldLock = nextCount >= OTP_VERIFY_MAX_ATTEMPTS;

  writeAttemptRecord(scope, email, {
    count: shouldLock ? 0 : nextCount,
    windowStart: nextWindowStart,
    lockUntil: shouldLock ? now + OTP_VERIFY_LOCK_MS : 0,
  });
}

export function clearPendingSignup() {
  sessionStorage.removeItem(PENDING_SIGNUP_KEY);
}

export function clearPendingForgotPassword() {
  sessionStorage.removeItem(PENDING_FORGOT_PASSWORD_KEY);
}

export async function startFirebaseOtpSignup(input: RegistrationInput) {
  const email = input.email.trim().toLowerCase();
  const code = generateOtpCode();
  const otpHash = await sha256Hex(`${email}:${code}`);

  setPendingSignup({
    email,
    password: input.password,
    date_of_birth: input.date_of_birth,
    country: input.country,
    otpHash,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  clearAttemptRecord("signup", email);

  return sendOtpEmail(email, code, "signup");
}

export async function resendFirebaseOtpCode(email: string) {
  const pending = getPendingSignup();
  const normalizedEmail = email.trim().toLowerCase();

  if (!pending || pending.email !== normalizedEmail) {
    throw new Error("No pending signup found for this email");
  }

  const code = generateOtpCode();
  const otpHash = await sha256Hex(`${normalizedEmail}:${code}`);

  setPendingSignup({
    ...pending,
    otpHash,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  clearAttemptRecord("signup", normalizedEmail);

  return sendOtpEmail(normalizedEmail, code, "signup");
}

export async function verifyFirebaseOtpCode(email: string, code: string) {
  const pending = getPendingSignup();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.trim();

  if (!pending || pending.email !== normalizedEmail) {
    throw new Error("No pending signup found for this email");
  }

  assertOtpAllowed("signup", normalizedEmail);

  if (pending.expiresAt < Date.now()) {
    clearPendingSignup();
    clearAttemptRecord("signup", normalizedEmail);
    throw new Error("Verification code expired. Please request a new code.");
  }

  const receivedHash = await sha256Hex(`${normalizedEmail}:${normalizedCode}`);
  if (receivedHash !== pending.otpHash) {
    recordOtpFailure("signup", normalizedEmail);
    throw new Error("Invalid verification code");
  }

  clearAttemptRecord("signup", normalizedEmail);

  return pending;
}

export async function startFirebaseForgotPasswordOtp(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const code = generateOtpCode();
  const otpHash = await sha256Hex(`${normalizedEmail}:${code}`);

  setPendingForgotPassword({
    email: normalizedEmail,
    otpHash,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  clearAttemptRecord("forgot", normalizedEmail);

  return sendOtpEmail(normalizedEmail, code, "password_reset");
}

export async function resendFirebaseForgotPasswordOtp(email: string) {
  const pending = getPendingForgotPassword();
  const normalizedEmail = email.trim().toLowerCase();

  if (!pending || pending.email !== normalizedEmail) {
    throw new Error("No pending password reset found for this email");
  }

  const code = generateOtpCode();
  const otpHash = await sha256Hex(`${normalizedEmail}:${code}`);
  setPendingForgotPassword({
    email: normalizedEmail,
    otpHash,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  clearAttemptRecord("forgot", normalizedEmail);

  return sendOtpEmail(normalizedEmail, code, "password_reset");
}

export async function verifyFirebaseForgotPasswordOtp(email: string, code: string) {
  const pending = getPendingForgotPassword();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.trim();

  if (!pending || pending.email !== normalizedEmail) {
    throw new Error("No pending password reset found for this email");
  }

  assertOtpAllowed("forgot", normalizedEmail);

  if (pending.expiresAt < Date.now()) {
    clearPendingForgotPassword();
    clearAttemptRecord("forgot", normalizedEmail);
    throw new Error("Verification code expired. Please request a new code.");
  }

  const receivedHash = await sha256Hex(`${normalizedEmail}:${normalizedCode}`);
  if (receivedHash !== pending.otpHash) {
    recordOtpFailure("forgot", normalizedEmail);
    throw new Error("Invalid verification code");
  }

  clearAttemptRecord("forgot", normalizedEmail);

  return pending.email;
}

export async function completeFirebaseForgotPasswordWithOtp(email: string, newPassword: string) {
  const endpoint = readClientEnvVar("VITE_OTP_PASSWORD_RESET_ENDPOINT") || "/v1/api/otp-password-reset";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: newPassword,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = String((payload as any)?.error || (payload as any)?.message || "Unable to reset password");
    throw new Error(message);
  }

  clearPendingForgotPassword();
}

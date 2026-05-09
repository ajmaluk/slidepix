import { authClient } from "@/lib/authClient";
import { resolveEdgeFunctionsBaseUrl } from "@/lib/apiConfig";

export class EdgeFunctionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
  }
}

function getFunctionsBaseUrl(): string {
  const baseUrl = resolveEdgeFunctionsBaseUrl();
  if (!baseUrl) {
    throw new EdgeFunctionError("Missing edge functions base URL configuration", 500);
  }
  return baseUrl;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await authClient.auth.getSession();

  if (!session?.access_token) {
    throw new EdgeFunctionError("No active session token", 401);
  }

  return session.access_token;
}

async function parseResponseBody(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }
  } catch (e) {
    console.error("Failed to parse JSON response:", e);
  }
  const text = await response.text().catch(() => "No response body");
  return { message: text };
}

export async function invokeEdgeFunction<T>(
  functionName: string,
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<T> {
  const baseUrl = getFunctionsBaseUrl();
  const accessToken = await getAccessToken();
  const timeoutMs = options?.timeoutMs ?? 20000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const rawMessage = String(data?.error || data?.message || "");
      const normalized = rawMessage.toLowerCase();

      if (normalized.includes("requested function was not found")) {
        throw new EdgeFunctionError(`Function not deployed: ${functionName}`, 404);
      }

      throw new EdgeFunctionError(
        rawMessage || `Function ${functionName} failed with status ${response.status}`,
        response.status
      );
    }

    return data as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new EdgeFunctionError(`Request timed out for ${functionName}`, 408);
    }
    if (err instanceof EdgeFunctionError) {
      throw err;
    }
    throw new EdgeFunctionError(err?.message || `Unexpected error calling ${functionName}`, 500);
  } finally {
    clearTimeout(timeout);
  }
}
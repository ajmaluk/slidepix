#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getConfig() {
  loadEnvFile(path.resolve(process.cwd(), ".env"));

  const edgeBase = process.env.VITE_EDGE_FUNCTIONS_BASE_URL || "";
  const bearerToken = process.env.E2E_BEARER_TOKEN || process.env.VITE_E2E_BEARER_TOKEN || "";

  if (!edgeBase) {
    throw new Error("Missing edge base URL. Set VITE_EDGE_FUNCTIONS_BASE_URL.");
  }

  const normalizedBase = edgeBase.endsWith("/functions/v1")
    ? edgeBase
    : `${edgeBase.replace(/\/+$/, "")}/functions/v1`;

  return {
    endpoint: `${normalizedBase}/chat`,
    bearerToken,
    iterations: Number(process.env.E2E_ITERATIONS || 2),
    timeoutMs: Number(process.env.E2E_TIMEOUT_MS || 90000),
  };
}

function buildLargeHistory() {
  const messages = [];
  for (let i = 0; i < 95; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `History chunk ${i + 1}: ${"Contextual enterprise data ".repeat(130)}`,
    });
  }
  messages.push({
    role: "user",
    content:
      "Given the context above, produce a concise but accurate architecture summary with risks and mitigations in bullet points.",
  });
  return messages;
}

const SCENARIOS = [
  {
    id: "simple-greeting",
    mode: "auto",
    expect: { minChars: 30, noIdentityDrift: true },
    messages: [{ role: "user", content: "Hi, introduce yourself in one sentence." }],
  },
  {
    id: "complex-technical",
    mode: "precise",
    expect: { minChars: 450, hasStructure: true },
    messages: [
      {
        role: "user",
        content:
          "Compare RAG chunking strategies for legal corpora with tradeoffs, implementation tips, and failure modes. Include step-by-step recommendations.",
      },
    ],
  },
  {
    id: "emotional-support-high",
    mode: "auto",
    expect: { minChars: 180, empathySignals: true },
    messages: [
      {
        role: "user",
        content:
          "I am overwhelmed and anxious about deadlines. Please help me break this into an actionable recovery plan with emotional support.",
      },
    ],
  },
  {
    id: "web-search-wikipedia",
    mode: "search",
    expect: { minChars: 260, citations: true, wikipediaMention: true },
    messages: [
      {
        role: "user",
        content:
          "Use web search and Wikipedia to summarize Alan Turing's key contributions and provide citations.",
      },
    ],
  },
  {
    id: "large-context-window",
    mode: "auto",
    expect: { minChars: 220, hasStructure: true },
    messages: buildLargeHistory(),
  },
  {
    id: "fact-check-current",
    mode: "auto",
    expect: { minChars: 180, citations: true },
    messages: [
      {
        role: "user",
        content:
          "What are the latest major TypeScript releases and key features? Verify with sources and include dates.",
      },
    ],
  },
];

function hasCitation(text) {
  return /\[[^\]]+\]\((https?:\/\/[^)]+)\)/i.test(text) || /https?:\/\//i.test(text);
}

function hasStructure(text) {
  return /(^|\n)#{1,4}\s|(^|\n)-\s|(^|\n)\d+\.\s/.test(text);
}

function hasEmpathy(text) {
  return /\b(i understand|i hear you|you are not alone|that sounds|it is okay|take a deep breath|take a breath|step by step|we can)\b/i.test(text);
}

function hasIdentityDrift(text) {
  return /\b(i'?m\s+nova|i\s+am\s+nova|chatgpt|as an openai assistant|i'?m\s+gemini)\b/i.test(text);
}

async function callChat({ endpoint, bearerToken, timeoutMs }, scenario) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: JSON.stringify({
        mode: scenario.mode,
        messages: scenario.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      return {
        ok: false,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error: errText || `HTTP ${response.status}`,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let searchResults = [];

    const extractText = (parsed) => {
      const byPath = [
        parsed?.choices?.[0]?.delta?.content,
        parsed?.choices?.[0]?.delta?.text,
        parsed?.choices?.[0]?.delta?.reasoning,
        parsed?.choices?.[0]?.delta?.reasoning_content,
        parsed?.choices?.[0]?.message?.content,
        parsed?.choices?.[0]?.text,
        parsed?.content,
        parsed?.response,
        parsed?.output_text,
        parsed?.text,
      ];

      for (const candidate of byPath) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          return candidate;
        }
      }

      const geminiParts = parsed?.candidates?.[0]?.content?.parts;
      if (Array.isArray(geminiParts)) {
        const joined = geminiParts
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .join("")
          .trim();
        if (joined.length > 0) return joined;
      }

      return "";
    };

    const processDataLine = (rawLine) => {
      const trimmed = rawLine.trim();
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        if (Array.isArray(parsed.searchResults)) {
          searchResults = parsed.searchResults;
        }
        const extracted = extractText(parsed);
        if (extracted) {
          content += extracted;
        }
      } catch {
        // Ignore non-JSON SSE chunks.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        processDataLine(line);
      }
    }

    // Process trailing buffered SSE data if the stream ended without a newline.
    if (buffer.trim()) {
      for (const tailLine of buffer.split(/\r?\n/)) {
        processDataLine(tailLine);
      }
    }

    return {
      ok: true,
      status: 200,
      latencyMs: Date.now() - startedAt,
      content,
      searchResults,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateResult(scenario, result) {
  const failures = [];
  const text = result.content || "";

  if (!result.ok) {
    failures.push({ bucket: "request_error", detail: result.error || "Request failed" });
    return failures;
  }

  if (!text.trim()) failures.push({ bucket: "empty_response", detail: "No model output." });
  if (scenario.expect.minChars && text.length < scenario.expect.minChars) {
    failures.push({
      bucket: "low_detail",
      detail: `Response too short (${text.length} chars, expected >= ${scenario.expect.minChars}).`,
    });
  }
  if (scenario.expect.hasStructure && !hasStructure(text)) {
    failures.push({ bucket: "missing_structure", detail: "Expected lists/headings for structured answer." });
  }
  if (scenario.expect.citations && !hasCitation(text)) {
    failures.push({ bucket: "missing_citations", detail: "Expected citations/URLs but none found." });
  }
  if (scenario.expect.wikipediaMention) {
    const hasWikiInSearch = (result.searchResults || []).some((item) => /wikipedia\.org/i.test(item.url || ""));
    const hasWikiText = /wikipedia/i.test(text);
    if (!hasWikiInSearch && !hasWikiText) {
      failures.push({
        bucket: "wikipedia_not_grounded",
        detail: "Expected Wikipedia grounding signal in results or answer.",
      });
    }
  }
  if (scenario.expect.empathySignals && !hasEmpathy(text)) {
    failures.push({ bucket: "low_empathy", detail: "High-emotion query lacked clear empathy signals." });
  }
  if (scenario.expect.noIdentityDrift && hasIdentityDrift(text)) {
    failures.push({ bucket: "identity_drift", detail: "Assistant identity drift detected." });
  }

  return failures;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function buildTargetedFixes(bucketCounts) {
  const fixes = [];
  if (bucketCounts.missing_citations) {
    fixes.push("Strengthen citation requirement in system prompt for auto-mode when search is triggered.");
  }
  if (bucketCounts.wikipedia_not_grounded) {
    fixes.push("Prioritize Wikipedia entries earlier in merged web-search ranking for biography/history style intents.");
  }
  if (bucketCounts.low_detail) {
    fixes.push("Increase minimum detail directive when user asks for analysis/comparison to prevent terse responses.");
  }
  if (bucketCounts.low_empathy) {
    fixes.push("Add explicit empathy-first line in adaptive directive templates for high-intensity emotional queries.");
  }
  if (bucketCounts.identity_drift) {
    fixes.push("Increase identity guard strictness and add post-response identity filter tests.");
  }
  if (bucketCounts.request_error) {
    fixes.push("Add retry with jitter for transient provider errors and tighten timeout fallbacks.");
  }
  return fixes;
}

async function main() {
  const cfg = getConfig();
  const allRuns = [];
  const failures = [];

  for (let i = 0; i < cfg.iterations; i++) {
    for (const scenario of SCENARIOS) {
      const result = await callChat(cfg, scenario);
      const runFailures = evaluateResult(scenario, result);
      allRuns.push({
        iteration: i + 1,
        scenario: scenario.id,
        mode: scenario.mode,
        status: result.status,
        latencyMs: result.latencyMs,
        contentLength: (result.content || "").length,
        failureCount: runFailures.length,
        failures: runFailures,
        sample: (result.content || "").slice(0, 240).replace(/\s+/g, " "),
      });
      for (const failure of runFailures) {
        failures.push({
          iteration: i + 1,
          scenario: scenario.id,
          ...failure,
        });
      }
      const statusLabel = runFailures.length === 0 ? "PASS" : `FAIL(${runFailures.length})`;
      console.log(`[${statusLabel}] ${scenario.id} #${i + 1} | ${result.latencyMs}ms | len=${(result.content || "").length}`);
    }
  }

  const latencies = allRuns.map((r) => r.latencyMs);
  const bucketCounts = failures.reduce((acc, f) => {
    acc[f.bucket] = (acc[f.bucket] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    totalRuns: allRuns.length,
    passedRuns: allRuns.filter((r) => r.failureCount === 0).length,
    failedRuns: allRuns.filter((r) => r.failureCount > 0).length,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)),
    failureBuckets: bucketCounts,
    targetedFixes: buildTargetedFixes(bucketCounts),
  };

  const reportDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(reportDir, `live-e2e-${stamp}.json`);
  const mdPath = path.join(reportDir, `live-e2e-${stamp}.md`);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        config: {
          endpoint: cfg.endpoint,
          iterations: cfg.iterations,
          timeoutMs: cfg.timeoutMs,
        },
        scenarios: SCENARIOS.map((s) => ({ id: s.id, mode: s.mode, expect: s.expect })),
        summary,
        failures,
        runs: allRuns,
      },
      null,
      2
    )
  );

  const md = [
    "# Live Chat E2E Quality Report",
    "",
    `- Total runs: ${summary.totalRuns}`,
    `- Passed runs: ${summary.passedRuns}`,
    `- Failed runs: ${summary.failedRuns}`,
    `- Latency avg: ${summary.avgLatencyMs} ms`,
    `- Latency p50: ${summary.p50LatencyMs} ms`,
    `- Latency p95: ${summary.p95LatencyMs} ms`,
    "",
    "## Failure Buckets",
    Object.keys(summary.failureBuckets).length
      ? Object.entries(summary.failureBuckets)
          .sort((a, b) => b[1] - a[1])
          .map(([bucket, count]) => `- ${bucket}: ${count}`)
          .join("\n")
      : "- No failures detected.",
    "",
    "## Targeted Fixes",
    summary.targetedFixes.length ? summary.targetedFixes.map((f) => `- ${f}`).join("\n") : "- None required.",
    "",
    "## Failure Details",
    failures.length
      ? failures
          .slice(0, 40)
          .map((f) => `- ${f.scenario} (iter ${f.iteration}): ${f.bucket} - ${f.detail}`)
          .join("\n")
      : "- No failure details.",
  ].join("\n");

  fs.writeFileSync(mdPath, md);

  console.log("\nReport files generated:");
  console.log(`- ${path.relative(process.cwd(), mdPath)}`);
  console.log(`- ${path.relative(process.cwd(), jsonPath)}`);

  if (summary.failedRuns > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Harness failed:", error);
  process.exit(1);
});

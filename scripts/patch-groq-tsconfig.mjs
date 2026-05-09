import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const targetPath = join(process.cwd(), "node_modules", "groq-sdk", "src", "tsconfig.json");

async function run() {
  if (!existsSync(targetPath)) {
    console.log("[postinstall] groq-sdk tsconfig not found, skipping patch.");
    return;
  }

  const raw = await readFile(targetPath, "utf8");
  let next = raw;

  // Remove any existing entries first to keep output idempotent and avoid duplicates.
  next = next
    .replace(/^\s*"module"\s*:\s*"[^"]+"\s*,?\s*$/gm, "")
    .replace(/^\s*"moduleResolution"\s*:\s*"[^"]+"\s*,?\s*$/gm, "")
    .replace(/^\s*"ignoreDeprecations"\s*:\s*"[^"]+"\s*,?\s*$/gm, "");
  next = next.replace(
    '"compilerOptions": {',
    '"compilerOptions": {\n    "module": "Node16",\n    "moduleResolution": "Node16",'
  );
  // Clean up accidental extra blank lines left from deletions.
  next = next.replace(/\n{3,}/g, "\n\n");

  if (next === raw) {
    console.log("[postinstall] groq-sdk tsconfig already patched.");
    return;
  }

  await writeFile(targetPath, next, "utf8");
  console.log("[postinstall] patched groq-sdk tsconfig.");
}

run().catch((error) => {
  console.warn("[postinstall] failed to patch groq-sdk tsconfig:", error?.message || error);
  // Do not fail install on a non-critical patch.
  process.exit(0);
});

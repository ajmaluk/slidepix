/**
 * Multi-Agent Content Generator
 * Detects large content requests and signals the backend to use extended token limits.
 */

const LARGE_CONTENT_PATTERNS = [
  /\b(complete|comprehensive|detailed|full|thorough)\s+(exam|study|revision|course)?\s*(ready)?\s*(notes|summary|guide|overview|material)\b/i,
  /\b(give|write|create|make|prepare)\s+(me\s+)?(complete|full|detailed|comprehensive)\s/i,
  /\b(exam\s+ready|revision)\s+(notes|material|guide)\b/i,
  /\b(summarize|summarise)\s+(everything|all|the entire|the whole|the complete)\b/i,
  /\b(chapter|section)\s+by\s+(chapter|section)\b/i,
];

/** Check if a query requests large-scale content generation */
export function isLargeContentRequest(query: string): boolean {
  return LARGE_CONTENT_PATTERNS.some(pattern => pattern.test(query));
}

/** Build section-aware prompt enhancement for large content */
export function buildLargeContentPrompt(query: string, documentContext: string): string {
  const estimatedSections = Math.max(3, Math.min(10, Math.ceil(documentContext.length / 3000)));

  return [
    `[Multi-Agent Content Generation Mode]`,
    `You are operating as an elite, world-class AI system. The user has requested comprehensive content generation. Follow this structure:`,
    `1. Analyze the source material and logically identify ${estimatedSections} major sections/topics.`,
    `2. For each section, generate highly detailed, production-quality, and expertly structured notes with:`,
    `   - Clear, descriptive headings and subheadings (## and ###)`,
    `   - Key definitions highlighted in **bold**`,
    `   - Important formulas/concepts perfectly formatted in code blocks or emphasis`,
    `   - Bullet points for quick, scannable review`,
    `   - Deep, insightful explanations that demonstrate absolute mastery of the subject`,
    `3. Include a comprehensive summary table or quick-reference at the end.`,
    `4. Use impeccable markdown formatting throughout.`,
    ``,
    `IMPORTANT: Generate ALL sections flawlessly in a single comprehensive response.`,
    `Do NOT truncate or say "continued in next message".`,
    `Cover the material exhaustively, leaving no detail behind.`,
  ].join("\n");
}

/** Estimate if the response will need extended tokens */
export function needsExtendedTokens(query: string, contextLength: number): boolean {
  if (isLargeContentRequest(query)) return true;
  if (contextLength > 5000 && /\b(notes|summary|guide|complete)\b/i.test(query)) return true;
  return false;
}

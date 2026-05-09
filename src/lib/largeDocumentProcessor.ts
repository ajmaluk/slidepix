/**
 * Large Document Processor - Parallel Multi-agent OCR Processing
 * 
 * Handles massive documents (10,000+ pages) using parallel agent processing,
 * intelligent chunking, streaming, and progress visualization.
 * 
 * Key features:
 * - Parallel OCR processing across multiple agents
 * - Intelligent chunking and reassembly
 * - Streaming results for immediate feedback
 * - Progress tracking and visualization
 * - Error recovery and retry logic
 * - Memory-efficient processing
 */

import type { OCRResult } from "./ocr";
import type { AgentId } from "./chat";
import { AgentCoordinator } from "./agentCoordinator";
import { buildSemanticIndex, semanticSearch } from "./semanticSearch";
import { tesseractPool } from "./tesseractPool";

// ─── Types ───────────────────────────────────────────────────────────

export type ProgressCallback = (progress: ProcessingProgress) => void;
export type GenerationProgressCallback = (progress: GenerationProgress) => void;

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  totalChunks: number;
  pages: number[];
  data: File | Blob;
  size: number;
  status: "pending" | "processing" | "completed" | "failed";
  assignedAgent?: string;
  startTime?: Date;
  endTime?: Date;
  result?: OCRResult;
  error?: string;
  retryCount: number;
}

export interface ProcessingStrategy {
  // Chunking strategy
  chunkSize: number; // pages per chunk
  maxParallelChunks: number;
  
  // Agent allocation
  agentsToUse: string[];
  loadBalancing: "round-robin" | "dynamic" | "least-loaded";
  
  // Performance
  priority: "speed" | "accuracy" | "balanced";
  preProcessing: boolean;
  postProcessing: boolean;
  
  // Error handling
  maxRetries: number;
  timeoutPerChunk: number; // milliseconds
  fallbackStrategy: "skip" | "retry" | "manual";
}

export interface ProcessingProgress {
  documentId: string;
  totalPages: number;
  totalChunks: number;
  
  // Progress metrics
  chunksCompleted: number;
  chunksProcessing: number;
  chunksFailed: number;
  
  pagesProcessed: number;
  percentComplete: number;
  
  // Time estimates
  startTime: Date;
  estimatedEndTime?: Date;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
  
  // Performance
  averageTimePerChunk: number;
  throughputPagesPerSecond: number;
  
  // Agent status
  activeAgents: {
    agentId: string;
    currentChunk?: number;
    pagesProcessed: number;
    status: string;
  }[];
  
  // Results
  results: OCRResult[];
  errors: string[];
}

export interface ProcessingResult {
  documentId: string;
  success: boolean;
  totalPages: number;
  pagesProcessed: number;
  
  // OCR results
  results: OCRResult[];
  combinedText: string;
  
  // Metadata
  processingTime: number;
  strategy: ProcessingStrategy;
  
  // Quality metrics
  averageConfidence: number;
  errorRate: number;
  
  // Searchable index
  searchIndex?: any;
  
  // Failures
  failedChunks: DocumentChunk[];
  errors: string[];
}

export interface ContentGenerationTask {
  id: string;
  sectionTitle: string;
  domain: string;
  range: [number, number]; // [start, end] characters or pages
  assignedAgent: AgentId;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
}

export interface GenerationProgress {
  taskId: string;
  totalTasks: number;
  completedTasks: number;
  tasks: ContentGenerationTask[];
  status: "initializing" | "generating" | "integrating" | "completed" | "failed";
  startTime: Date;
  endTime?: Date;
}

interface PhonebookIndex {
  byName: Map<string, Set<string>>;
  byPhone: Map<string, Set<string>>;
  entries: number;
}

// ─── Large Document Processor ────────────────────────────────────────

/**
 * Orchestrates the processing of massive documents and long-form content generation.
 * Uses a multi-agent parallel processing model to ensure scalability and speed.
 */
export class LargeDocumentProcessor {
  private coordinator: AgentCoordinator;
  private activeProcessing = new Map<string, ProcessingProgress>();
  private progressCallbacks = new Map<string, ProgressCallback[]>();
  private resultsCache = new Map<string, OCRResult>();
  private phonebookIndexCache = new Map<string, PhonebookIndex>();

  constructor() {
    this.coordinator = new AgentCoordinator();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private fingerprintText(text: string): string {
    // Lightweight deterministic hash to avoid cache collisions on same-length docs.
    let hash = 0;
    const maxChars = Math.min(text.length, 6000);
    for (let i = 0; i < maxChars; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16);
  }

  private normalizePhone(raw: string): string {
    const trimmed = raw
      .trim()
      .replace(/[Oo]/g, "0")
      .replace(/[Il]/g, "1")
      .replace(/[Ss]/g, "5")
      .replace(/[Bb]/g, "8");
    const hasPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return "";
    return hasPlus ? `+${digits}` : digits;
  }

  private normalizeName(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/(?<=[a-z])0(?=[a-z])/g, "o")
      .replace(/(?<=[a-z])1(?=[a-z])/g, "i")
      .replace(/(?<=[a-z])3(?=[a-z])/g, "e")
      .replace(/(?<=[a-z])5(?=[a-z])/g, "s")
      .replace(/(?<=[a-z])8(?=[a-z])/g, "b")
      .replace(/[^a-z0-9\s.'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private canonicalBlock(content: string): string {
    return content
      .toLowerCase()
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private trimBoundaryOverlap(previous: string, current: string): string {
    if (!previous || !current) return current;

    const prevTail = previous.slice(-1400);
    const currHead = current.slice(0, 1400);
    const maxOverlap = Math.min(prevTail.length, currHead.length, 800);

    for (let len = maxOverlap; len >= 120; len--) {
      const left = this.canonicalBlock(prevTail.slice(-len));
      const right = this.canonicalBlock(currHead.slice(0, len));
      if (left.length >= 80 && left === right) {
        return current.slice(len).trimStart();
      }
    }

    return current;
  }

  private dedupeMergedContent(content: string): string {
    const blocks = content
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const kept: string[] = [];

    for (const block of blocks) {
      const key = this.canonicalBlock(block);
      if (!key) continue;

      const isDuplicate = key.length > 40 && seen.has(key);
      if (!isDuplicate) {
        kept.push(block);
        if (key.length > 40) seen.add(key);
      }
    }

    return kept.join("\n\n");
  }

  private postProcessMergedContent(content: string): string {
    const blocks = content
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    const stitched: string[] = [];
    for (const block of blocks) {
      if (stitched.length === 0) {
        stitched.push(block);
        continue;
      }
      stitched[stitched.length - 1] = stitched[stitched.length - 1].trimEnd();
      const trimmed = this.trimBoundaryOverlap(stitched[stitched.length - 1], block);
      if (trimmed) stitched.push(trimmed);
    }

    return this.dedupeMergedContent(stitched.join("\n\n"));
  }

  private scoreNameSimilarity(queryName: string, candidateName: string): number {
    const queryTokens = new Set(this.normalizeName(queryName).split(" ").filter(Boolean));
    const candidateTokens = new Set(this.normalizeName(candidateName).split(" ").filter(Boolean));
    if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) overlap += 1;
    }

    const union = new Set([...queryTokens, ...candidateTokens]).size;
    return overlap / Math.max(1, union);
  }

  private addPhonebookEntry(index: PhonebookIndex, nameRaw: string, phoneRaw: string): void {
    const cleanedNameRaw = nameRaw
      .replace(/\b(phone|mobile|number|contact|tel|ph0ne|m0bile)\b.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();
    const name = this.normalizeName(cleanedNameRaw);
    const phone = this.normalizePhone(phoneRaw);
    if (!name || !phone) return;

    if (!index.byName.has(name)) index.byName.set(name, new Set());
    if (!index.byPhone.has(phone)) index.byPhone.set(phone, new Set());
    index.byName.get(name)!.add(phone);
    index.byPhone.get(phone)!.add(name);
    index.entries += 1;
  }

  private parseDelimitedCells(line: string): string[] {
    const delimiter = line.includes("\t") ? "\t" : line.includes(",") ? "," : "";
    if (!delimiter) return [];

    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += ch;
    }

    cells.push(current.trim());
    return cells;
  }

  private tryParseDelimitedPhonebookRow(index: PhonebookIndex, line: string): boolean {
    const cells = this.parseDelimitedCells(line);
    if (cells.length < 2) return false;

    const normalizedCells = cells.map((c) => c.toLowerCase().trim());
    const hasNameHeader = normalizedCells.some((c) => /\b(name|full[_\s-]?name|person|contact)\b/.test(c));
    const hasPhoneHeader = normalizedCells.some((c) => /\b(phone|mobile|number|tel|contact[_\s-]?number|phone[_\s-]?number)\b/.test(c));
    if (hasNameHeader && hasPhoneHeader) return false;

    const phoneIdx = cells.findIndex((cell) => {
      const normalized = this.normalizePhone(cell);
      const digits = normalized.replace(/^\+/, "");
      return digits.length >= 7;
    });
    if (phoneIdx < 0) return false;

    const candidateNameIdx = cells.findIndex((cell, idx) => {
      if (idx === phoneIdx) return false;
      const cleaned = cell.trim();
      if (!cleaned) return false;
      if (/\d{2,}/.test(cleaned)) return false;
      if (/^[^A-Za-z]*$/.test(cleaned)) return false;
      if (/^(department|team|group|role|location|city|state|country|email)$/i.test(cleaned)) return false;
      return true;
    });
    if (candidateNameIdx < 0) return false;

    this.addPhonebookEntry(index, cells[candidateNameIdx], cells[phoneIdx]);
    return true;
  }

  private buildPhonebookIndex(documentId: string, text: string): PhonebookIndex {
    const cacheKey = `${documentId}:${text.length}:${this.fingerprintText(text)}`;
    const cached = this.phonebookIndexCache.get(cacheKey);
    if (cached) return cached;

    const index: PhonebookIndex = {
      byName: new Map(),
      byPhone: new Map(),
      entries: 0,
    };

    const lines = text.split(/\r?\n/);
    const namePhonePattern = /\bname\s*[:=-]\s*([A-Za-z][A-Za-z0-9 .'-]{1,80})[^\n]{0,80}?\b(?:phone|mobile|number|contact)\s*[:=-]\s*(\+?\d[\d\s().-]{6,}\d)\b/i;
    const inlinePattern = /\b([A-Za-z][A-Za-z0-9 .'-]{1,80})\s*(?:\||,|;|-|:|\t)\s*(\+?\d[\d\s().-]{6,}\d)\b/;
    const reverseInlinePattern = /\b(\+?\d[\d\s().-]{6,}\d)\s*(?:\||,|;|-|:|\t)\s*([A-Za-z][A-Za-z0-9 .'-]{1,80})\b/;

    for (const line of lines) {
      if (!line || line.length < 6) continue;

      const tolerantLine = line
        .replace(/\bnarne\b/gi, "name")
        .replace(/\bnme\b/gi, "name")
        .replace(/\bph0ne\b/gi, "phone")
        .replace(/\bm0bile\b/gi, "mobile")
        .replace(/\bnurnber\b/gi, "number")
        .replace(/\bnu[mrn]ber\b/gi, "number");

      // Prefer structured delimited extraction before loose regexes to avoid
      // partial captures such as "123 4567\tmira" from TSV/email rows.
      if (this.tryParseDelimitedPhonebookRow(index, tolerantLine)) {
        continue;
      }

      const first = tolerantLine.match(namePhonePattern);
      if (first) {
        this.addPhonebookEntry(index, first[1], first[2]);
        continue;
      }

      const second = tolerantLine.match(inlinePattern);
      if (second) {
        this.addPhonebookEntry(index, second[1], second[2]);
        continue;
      }

      const third = tolerantLine.match(reverseInlinePattern);
      if (third) {
        this.addPhonebookEntry(index, third[2], third[1]);
        continue;
      }

      const jsonLike = tolerantLine.match(/"(?:name|person|contact)"\s*:\s*"([^"]{2,80})"[\s\S]*?"(?:phone|mobile|number|tel)"\s*:\s*"([^"]{6,40})"/i)
        || tolerantLine.match(/"(?:phone|mobile|number|tel)"\s*:\s*"([^"]{6,40})"[\s\S]*?"(?:name|person|contact)"\s*:\s*"([^"]{2,80})"/i);
      if (jsonLike) {
        const maybeName = jsonLike[1]?.includes("+") || /\d{5,}/.test(jsonLike[1]) ? jsonLike[2] : jsonLike[1];
        const maybePhone = jsonLike[1]?.includes("+") || /\d{5,}/.test(jsonLike[1]) ? jsonLike[1] : jsonLike[2];
        this.addPhonebookEntry(index, maybeName, maybePhone);
        continue;
      }

      const looseName = tolerantLine.match(/\b(?:name|person|contact)\s*[:=-]?\s*([A-Za-z][A-Za-z0-9 .'-]{1,80})/i);
      const loosePhone = tolerantLine.match(/\b(?:phone|mobile|number|contact|no\.?|tel)\s*[:=-]?\s*(\+?[\dOIlSsBb][\dOIlSsBb\s().-]{6,}[\dOIlSsBb])/i);
      if (looseName && loosePhone) {
        this.addPhonebookEntry(index, looseName[1], loosePhone[1]);
        continue;
      }

      const freePhone = tolerantLine.match(/\+?[\dOIlSsBb][\dOIlSsBb\s().-]{6,}[\dOIlSsBb]/);
      if (freePhone) {
        const leftSide = tolerantLine.slice(0, freePhone.index || 0).trim();
        const rightSide = tolerantLine.slice((freePhone.index || 0) + freePhone[0].length).trim();
        const candidateName = (leftSide || rightSide)
          .replace(/^[|,:;\-\s]+|[|,:;\-\s]+$/g, "")
          .replace(/^(?:name|person|contact)\s*[:=-]?\s*/i, "");
        if (/^[A-Za-z][A-Za-z0-9 .'-]{1,80}$/.test(candidateName)) {
          this.addPhonebookEntry(index, candidateName, freePhone[0]);
        }
      }
    }

    this.phonebookIndexCache.set(cacheKey, index);
    if (this.phonebookIndexCache.size > 6) {
      const firstKey = this.phonebookIndexCache.keys().next().value as string | undefined;
      if (firstKey) this.phonebookIndexCache.delete(firstKey);
    }

    return index;
  }

  private tryResolvePhonebookQuery(documentId: string, text: string, query: string): string | null {
    const q = query.toLowerCase();
    const isPhonebookIntent = /\b(phone|number|contact|mobile|call|dial|reach|whose number|who\s*is\s*\+?\d|contact\s+details|contact\s+info)\b/i.test(q);
    if (!isPhonebookIntent) return null;

    const index = this.buildPhonebookIndex(documentId, text);
    if (index.entries === 0) return null;

    const queryPhoneRaw = (query.match(/\+?\d[\d\s().-]{6,}\d/) || [""])[0];
    const queryPhone = this.normalizePhone(queryPhoneRaw);

    if (queryPhone) {
      const matchedNames = index.byPhone.get(queryPhone);
      if (matchedNames && matchedNames.size > 0) {
        const names = Array.from(matchedNames).slice(0, 6);
        return [
          `[Phonebook Match]`,
          `Number ${queryPhoneRaw || queryPhone} belongs to: ${names.join(", ")}`,
          `(indexed entries: ${index.entries})`,
        ].join("\n");
      }

      const queryDigits = queryPhone.replace(/^\+/, "");
      const suffixLengths = [10, 9, 8].filter((n) => queryDigits.length >= n);
      const canonicalCandidates = Array.from(index.byPhone.entries()).filter(([phone]) => {
        const phoneDigits = phone.replace(/^\+/, "");
        const baseMatch = suffixLengths.some((n) => phoneDigits.endsWith(queryDigits.slice(-n)));
        if (baseMatch) return true;

        if (queryDigits.startsWith("0") && queryDigits.length >= 8) {
          const withoutTrunkZero = queryDigits.slice(1);
          const trunkLengths = [withoutTrunkZero.length, 9, 8].filter((n) => withoutTrunkZero.length >= n);
          return trunkLengths.some((n) => phoneDigits.endsWith(withoutTrunkZero.slice(-n)));
        }

        return false;
      });

      if (canonicalCandidates.length > 0) {
        const uniqueNumbers = Array.from(new Set(canonicalCandidates.map(([phone]) => phone)));
        if (uniqueNumbers.length <= 3) {
          const names = Array.from(
            new Set(canonicalCandidates.flatMap(([, matched]) => Array.from(matched)))
          ).slice(0, 6);
          return [
            `[Phonebook Match]`,
            `Number ${queryPhoneRaw || queryPhone} belongs to: ${names.join(", ")}`,
            `Matched via canonical number normalization (${uniqueNumbers.join(", ")}).`,
            `(indexed entries: ${index.entries})`,
          ].join("\n");
        }
      }

      const suffix = queryPhone.slice(-7);
      const fuzzy = Array.from(index.byPhone.entries()).filter(([phone]) => phone.endsWith(suffix));
      if (fuzzy.length > 0) {
        const preview = fuzzy.slice(0, 3).map(([phone, names]) => `${phone}: ${Array.from(names).join(", ")}`);
        return [
          `[Phonebook Approx Match]`,
          `No exact match for ${queryPhoneRaw || queryPhone}. Closest by trailing digits:`,
          ...preview,
          `(indexed entries: ${index.entries})`,
        ].join("\n");
      }
      return `No phonebook match found for ${queryPhoneRaw || queryPhone}. Indexed ${index.entries} entries.`;
    }

    const namePattern = /(?:number|phone|contact|contact\s+details|contact\s+info)\s+(?:of|for)\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)(?:\s+(?:in|from|on|within|inside|at)\b|[?.!,]|$)/i;
    const altNamePattern = /who(?:'s|\s+is)\s+number\s+is\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)(?:\s+(?:in|from|on|within|inside|at)\b|[?.!,]|$)/i;
    const contactDetailsPattern = /(?:contact\s+details|contact\s+info|details\s+for|contact\s+for)\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)(?:\s+(?:in|from|on|within|inside|at)\b|[?.!,]|$)/i;
    const reachPattern = /(?:reach|call|dial)\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)(?:\s+(?:in|from|on|within|inside|at)\b|[?.!,]|$)/i;
    const extractedName = (query.match(namePattern)?.[1] || query.match(altNamePattern)?.[1] || query.match(contactDetailsPattern)?.[1] || query.match(reachPattern)?.[1] || "")
      .replace(/\b(record|book|phonebook|directory|uploaded|file|document)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!extractedName) return null;

    const normalizedName = this.normalizeName(extractedName);
    const exactPhones = index.byName.get(normalizedName);
    if (exactPhones && exactPhones.size > 0) {
      return [
        `[Phonebook Match]`,
        `${extractedName} -> ${Array.from(exactPhones).slice(0, 8).join(", ")}`,
        `(indexed entries: ${index.entries})`,
      ].join("\n");
    }

    const fuzzyNames = Array.from(index.byName.entries())
      .map(([name, phones]) => ({
        name,
        phones,
        score: this.scoreNameSimilarity(normalizedName, name),
      }))
      .filter((item) => item.score > 0.22 || item.name.includes(normalizedName) || normalizedName.includes(item.name))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (fuzzyNames.length > 0) {
      const suggestions = fuzzyNames.map(({ name, phones, score }) => `${name}: ${Array.from(phones).slice(0, 3).join(", ")} (score ${score.toFixed(2)})`);
      return [
        `[Phonebook Approx Match]`,
        `No exact match for ${extractedName}. Closest entries:`,
        ...suggestions,
        `(indexed entries: ${index.entries})`,
      ].join("\n");
    }

    return `No phonebook match found for ${extractedName}. Indexed ${index.entries} entries.`;
  }

  /**
   * Generates large-scale content by dividing a query and context into logical sections,
   * assigning them to specialized sub-agents, and merging the results.
   */
  async generateLargeContent(
    text: string,
    query: string,
    onProgress?: GenerationProgressCallback,
    userContext?: string
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    console.log(`🤖 Starting multi-agent content generation for query: "${query}"`);

    // 1. Analyze and Plan (Lead Agent: Arun)
    const sections = await this.planContentStructure(text, query);
    
    const progress: GenerationProgress = {
      taskId,
      totalTasks: sections.length,
      completedTasks: 0,
      tasks: sections.map((s, i) => ({
        id: `task-${i}`,
        sectionTitle: s.title,
        domain: s.domain || "Document Content",
        range: s.range,
        assignedAgent: s.agentId,
        prompt: s.prompt,
        status: "pending",
      })),
      status: "generating",
      startTime: new Date(),
    };

    if (onProgress) onProgress(progress);

    // 2. Parallel Generation (Sub-agents)
    const generationResults = await Promise.all(
      progress.tasks.map(async (task) => {
        try {
          task.status = "processing";
          if (onProgress) onProgress({ ...progress });

          const sectionText = text.substring(task.range[0], task.range[1]);
          const fullPrompt = userContext 
            ? `${task.prompt}\n\n[USER PERSONALIZATION CONTEXT]\n${userContext}`
            : task.prompt;

          const result = await this.coordinator.runAgentTask(
            task.assignedAgent,
            fullPrompt,
            sectionText
          );

          task.status = "completed";
          task.result = result;
          progress.completedTasks++;
          if (onProgress) onProgress({ ...progress });
          return result;
        } catch (error: any) {
          task.status = "failed";
          task.error = error.message;
          if (onProgress) onProgress({ ...progress });
          return `Error generating section ${task.sectionTitle}: ${error.message}`;
        }
      })
    );

    const mergedSections = generationResults
      .map((section) => section.trim())
      .filter(Boolean);
    const trimmedSections: string[] = [];
    for (const section of mergedSections) {
      if (trimmedSections.length === 0) {
        trimmedSections.push(section);
        continue;
      }
      const previous = trimmedSections[trimmedSections.length - 1];
      const trimmed = this.trimBoundaryOverlap(previous, section);
      if (trimmed) trimmedSections.push(trimmed);
    }

    // 3. Integration and Refinement (Integration Agent: Kiran)
    progress.status = "integrating";
    if (onProgress) onProgress({ ...progress });

    const finalResponse = await this.integrateContent(trimmedSections, query);

    // 4. Final Quality Verification (Verification Agent: Maya)
    console.log("🧐 Final verification by Maya to ensure 100% topic coverage...");
    const verifiedResponse = await this.coordinator.runAgentTask(
      "maya",
      `Review this final document generated for the query: "${query}". 
      
      Verify:
      1. Are all major topics from the original notes included?
      2. Is the content detailed and not just a summary?
      3. Are the transitions between sections logical?
      
      If the document is complete, return it as is. 
      If anything is missing, briefly add the missing topics at the end under a "SUPPLEMENTARY NOTES" header.`,
      finalResponse.slice(0, 30000) // Context-aware verification
    );

    progress.status = "completed";
    progress.endTime = new Date();
    if (onProgress) onProgress({ ...progress });

    return this.postProcessMergedContent(verifiedResponse);
  }

  private async planContentStructure(text: string, query: string): Promise<any[]> {
    console.log("🧠 Lead agent Arun is identifying all topics for complete coverage...");
    
    // Use a larger sample for planning to ensure all topics are captured
    const planningContext = text.slice(0, 15000); 
    const result = await this.coordinator.runAgentTask(
      "arun",
      `I need to generate a COMPLETE and DETAILED note for the query: "${query}". 
      
      Your task is to:
      1. Identify ALL key topics, chapters, and sub-sections present in the text.
      2. Create a high-fidelity plan that covers EVERY single topic without skipping anything.
      3. Divide the document into logical segments (by character range) that each cover specific topics.
      
      Return a JSON array of sections: [{title, range: [start, end], agentId, prompt}].
      Assign sections to specialized agents (isha for technical logic, kiran for synthesis, nila for facts, ravi for detailed elaboration).
      Ensure the prompts specifically instruct the agents to "include ALL details" for their assigned topics.`,
      planningContext
    );

    try {
      // Find JSON block in response
      const jsonMatch = result.match(/\[\s*\{.*\}\s*\]/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const safeSections = parsed
            .map((section: any, idx: number) => {
              const start = Number(section?.range?.[0]);
              const end = Number(section?.range?.[1]);
              const safeStart = Number.isFinite(start) ? Math.max(0, Math.min(start, text.length)) : idx * 15000;
              const safeEnd = Number.isFinite(end)
                ? Math.max(safeStart + 1, Math.min(end, text.length))
                : Math.min((idx + 1) * 15000, text.length);
              const fallbackAgent = (idx % 4 === 0 ? "isha" : idx % 4 === 1 ? "kiran" : idx % 4 === 2 ? "nila" : "ravi") as AgentId;

              return {
                title: String(section?.title || `Section ${idx + 1}`),
                range: [safeStart, safeEnd],
                agentId: (section?.agentId || fallbackAgent) as AgentId,
                prompt: String(section?.prompt || `Generate complete notes for this section relevant to: ${query}`),
              };
            })
            .filter((section: any) => section.range[1] > section.range[0]);

          if (safeSections.length > 0) return safeSections;
        }
      }
      
      // Fallback if no JSON found
      console.warn("Could not parse plan from Arun, using default chunking.");
      return this.buildFallbackSections(text, query);
    } catch {
      return this.buildFallbackSections(text, query);
    }
  }

  private buildFallbackSections(text: string, query: string): any[] {
    const totalLen = text.length;
    const safeLen = Math.max(totalLen, 1);
    const numSections = Math.max(1, Math.ceil(safeLen / 15000));
    const fallbackAgents: AgentId[] = ["isha", "kiran", "nila", "ravi"];

    return Array.from({ length: numSections }, (_, i) => ({
      title: `Section ${i + 1}`,
      range: [i * 15000, Math.min((i + 1) * 15000, safeLen)],
      agentId: fallbackAgents[i % fallbackAgents.length],
      prompt: `Continue the response for: ${query}. Include complete details for this section.`,
    }));
  }

  private async integrateContent(results: string[], query: string): Promise<string> {
    if (results.length === 0) return "";
    if (results.length === 1) return results[0];

    console.log(`🌲 Recursively integrating ${results.length} sections...`);
    
    // Group results into batches that fit into a single AI context
    const batchSize = 5;
    const batches: string[][] = [];
    for (let i = 0; i < results.length; i += batchSize) {
      batches.push(results.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
      batches.map(async (batch, idx) => {
        const combinedBatch = batch.join("\n\n---\n\n");
        if (combinedBatch.length < 25000) { // Increased context window for synthesis
          try {
            return await this.coordinator.runAgentTask(
              "kiran",
              `Integrate these ${batch.length} sections (Batch ${idx + 1}/${batches.length}) for the query: "${query}". 
              
              CRITICAL: 
              1. DO NOT summarize or truncate content. 
              2. Preserve ALL topics, headers, and detailed notes from each section. 
              3. Ensure a seamless transition between topics while maintaining the full depth of information.`,
              combinedBatch
            );
          } catch (error) {
            console.warn(`Batch integration failed, using raw join:`, error);
            return combinedBatch;
          }
        }
        return combinedBatch;
      })
    );

    // Recursively integrate the batch results until we have a single document
    return this.integrateContent(batchResults, query);
  }

  private splitTextSmartly(text: string, targetChunkSize: number): number[] {
    const boundaries = [0];
    let currentPos = 0;
    
    while (currentPos < text.length - targetChunkSize) {
      const targetPos = currentPos + targetChunkSize;
      let breakPos = text.lastIndexOf("\n\n", targetPos + 500);
      
      if (breakPos <= currentPos || breakPos > targetPos + 1000) {
        breakPos = text.lastIndexOf("\n", targetPos + 500);
      }
      
      if (breakPos <= currentPos || breakPos > targetPos + 1000) {
        breakPos = targetPos;
      } else {
        breakPos += 2;
      }
      
      boundaries.push(breakPos);
      currentPos = breakPos;
    }
    
    boundaries.push(text.length);
    return Array.from(new Set(boundaries)).sort((a, b) => a - b);
  }

  /**
   * Smartly decides whether to perform a full synthesis or a targeted search
   * based on the user's query and the document content.
   */
  async smartProcess(
    text: string,
    query: string,
    onProgress?: GenerationProgressCallback,
    userContext: string = ""
  ): Promise<string> {
    console.log(`🧠 Deciding strategy for large document task: "${query}"`);
    
    const decisionPrompt = `I have a large document and a user query. 
    Query: "${query}"
    
    Decide if the user wants:
    1. "synthesis": A complete summary, full notes, or a comprehensive refactoring of the entire content.
    2. "search": A specific answer, a particular fact, or a "needed part" from the document.
    
    Respond with ONLY the word "synthesis" or "search".`;

    let decision = "";
    try {
      decision = await this.coordinator.runAgentTask(
        "arun",
        decisionPrompt,
        text.slice(0, 10000) // Use first 10k chars for context
      );
    } catch (error) {
      console.warn("Strategy decision failed, falling back to heuristic routing:", error);
    }

    const strategy = this.resolveProcessingStrategy(query, decision);

    if (strategy === "search") {
      console.log("🔍 Strategy: Targeted Search");
      // For search, we use the multiAgentSearch logic but wrapped in our progress handler
      return this.multiAgentSearch({
        documentId: "active-doc",
        success: true,
        totalPages: 0,
        pagesProcessed: 0,
        results: [],
        combinedText: text,
        processingTime: 0,
        strategy: {} as any,
        averageConfidence: 1,
        errorRate: 0,
        failedChunks: [],
        errors: []
      }, query, onProgress);
    } else {
      console.log("🌲 Strategy: Full Synthesis");
      return this.generateLargeContent(text, query, onProgress, userContext);
    }
  }

  private resolveProcessingStrategy(query: string, decision: string): "search" | "synthesis" {
    const normalizedDecision = (decision || "").toLowerCase();
    if (normalizedDecision.includes("search")) return "search";
    if (normalizedDecision.includes("synthesis")) return "synthesis";

    const normalizedQuery = query.toLowerCase();
    const synthesisSignal = /\b(complete|comprehensive|detailed|full|thorough|all|entire|chapter by chapter|exam ready|notes|guide|overview|material|refactor)\b/;
    const searchSignal = /\b(what|which|who|where|when|why|how|find|locate|specific|exact|quote|deadline|page|line|mentioned)\b/;

    if (synthesisSignal.test(normalizedQuery)) return "synthesis";
    if (searchSignal.test(normalizedQuery)) return "search";

    // Default to synthesis so long-form requests never degrade into narrow snippets.
    return "synthesis";
  }

  async multiAgentSearch(
    result: ProcessingResult,
    query: string,
    onProgress?: GenerationProgressCallback
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    console.log(`🔍 Starting multi-agent search in document: "${result.documentId}"`);

    const deterministicPhonebookAnswer = this.tryResolvePhonebookQuery(
      result.documentId,
      result.combinedText,
      query
    );
    if (deterministicPhonebookAnswer) {
      return deterministicPhonebookAnswer;
    }

    const searchPlan = await this.planSearchStrategy(result, query);
    
    const progress: GenerationProgress = {
      taskId,
      totalTasks: searchPlan.length,
      completedTasks: 0,
      tasks: searchPlan.map((s: any, i: number) => ({
        id: `search-task-${i}`,
        sectionTitle: s.title,
        domain: "Document Search",
        range: s.range,
        assignedAgent: s.agentId,
        prompt: s.prompt,
        status: "pending",
      })),
      status: "generating",
      startTime: new Date(),
    };

    if (onProgress) onProgress(progress);

    const searchFindings = await Promise.all(
      progress.tasks.map(async (task) => {
        try {
          task.status = "processing";
          if (onProgress) onProgress({ ...progress });

          const partText = result.combinedText.substring(task.range[0], task.range[1]);
          const findings = await this.coordinator.runAgentTask(
            task.assignedAgent,
            task.prompt,
            partText
          );

          task.status = "completed";
          task.result = findings;
          progress.completedTasks++;
          if (onProgress) onProgress({ ...progress });
          return findings;
        } catch (error: any) {
          task.status = "failed";
          task.error = error.message;
          if (onProgress) onProgress({ ...progress });
          return `Search error in ${task.sectionTitle}: ${error.message}`;
        }
      })
    );

    progress.status = "integrating";
    if (onProgress) onProgress({ ...progress });

    const finalFindings = await this.integrateFindings(searchFindings, query);

    progress.status = "completed";
    progress.endTime = new Date();
    if (onProgress) onProgress({ ...progress });

    return finalFindings;
  }

  private async planSearchStrategy(result: ProcessingResult, query: string): Promise<any[]> {
    const textLength = result.combinedText.length;
    const numSections = Math.ceil(textLength / 10000);
    const searchPlan = [];

    for (let i = 0; i < numSections; i++) {
      const start = i * 10000;
      const end = Math.min((i + 1) * 10000, textLength);
      
      searchPlan.push({
        title: `Search Lane ${i + 1}`,
        range: [start, end],
        agentId: "arjun" as AgentId,
        prompt: `Search this section for information related to: "${query}". Extract relevant quotes, facts, and figures.`,
      });
    }

    return searchPlan;
  }

  private async integrateFindings(findings: string[], query: string): Promise<string> {
    if (findings.length === 0) return "No relevant information found.";
    if (findings.length === 1) return findings[0];

    console.log(`🌲 Recursively integrating ${findings.length} search findings...`);
    
    // Group findings into batches
    const batchSize = 6;
    const batches: string[][] = [];
    for (let i = 0; i < findings.length; i += batchSize) {
      batches.push(findings.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
      batches.map(async (batch, idx) => {
        const combinedBatch = batch.join("\n\n---\n\n");
        if (combinedBatch.length < 15000) {
          try {
            return await this.coordinator.runAgentTask(
              "kiran",
              `Synthesize these ${batch.length} search findings (Batch ${idx + 1}/${batches.length}) for the query: "${query}". Extract key facts and remove duplicates.`,
              combinedBatch
            );
          } catch (error) {
            console.warn(`Batch finding integration failed:`, error);
            return combinedBatch;
          }
        }
        return combinedBatch;
      })
    );

    return this.postProcessMergedContent(await this.integrateFindings(batchResults, query));
  }

  async processLargeDocument(
    file: File,
    strategy: Partial<ProcessingStrategy> = {},
    onProgress?: ProgressCallback
  ): Promise<ProcessingResult> {
    const documentId = this.generateDocumentId(file);
    const estimatedPages = await this.estimatePageCount(file);
    
    if (estimatedPages === 0) {
      throw new Error("Unable to determine page count");
    }

    const finalStrategy = this.buildStrategy(strategy, estimatedPages);
    const chunks = await this.createChunks(file, finalStrategy, estimatedPages);

    const progress = this.initializeProgress(
      documentId,
      estimatedPages,
      chunks,
      finalStrategy
    );
    this.activeProcessing.set(documentId, progress);

    if (onProgress) {
      this.registerProgressCallback(documentId, onProgress);
    }

    const results = await this.processChunksParallel(
      documentId,
      chunks,
      finalStrategy
    );

    const finalResult = this.combineResults(
      documentId,
      file,
      chunks,
      results,
      finalStrategy,
      progress
    );

    if (finalResult.success && finalResult.results.length > 0) {
      finalResult.searchIndex = await this.buildSearchIndex(finalResult.results);
    }

    this.activeProcessing.delete(documentId);
    this.progressCallbacks.delete(documentId);

    return finalResult;
  }

  private async processChunksParallel(
    documentId: string,
    chunks: DocumentChunk[],
    strategy: ProcessingStrategy
  ): Promise<Map<string, OCRResult>> {
    const results = new Map<string, OCRResult>();
    const queue = [...chunks];
    const processing = new Set<string>();
    const maxConcurrency = strategy.maxParallelChunks;
    const availableAgents = [...strategy.agentsToUse];
    let nextAgentIndex = 0;

    const runChunk = async (chunk: DocumentChunk) => {
      const agentId = availableAgents[nextAgentIndex % availableAgents.length];
      nextAgentIndex++;

      chunk.assignedAgent = agentId;
      chunk.status = "processing";
      chunk.startTime = new Date();
      processing.add(chunk.id);

      this.updateProgress(documentId, { chunksProcessing: processing.size });

      try {
        const cacheKey = `${documentId}:${chunk.id}`;
        if (this.resultsCache.has(cacheKey)) {
          const cachedResult = this.resultsCache.get(cacheKey)!;
          results.set(chunk.id, cachedResult);
          chunk.status = "completed";
          chunk.result = cachedResult;
        } else {
          const result = await this.processChunk(chunk, strategy);
          chunk.status = "completed";
          chunk.result = result;
          results.set(chunk.id, result);

          if (this.resultsCache.size < 500) {
            this.resultsCache.set(cacheKey, result);
          }
        }
        chunk.endTime = new Date();
      } catch (error: any) {
        chunk.status = "failed";
        chunk.error = error.message;
        chunk.retryCount++;

        if (chunk.retryCount < strategy.maxRetries) {
          const baseBackoffMs = Math.min(8000, Math.pow(2, chunk.retryCount - 1) * 500);
          const jitterMs = Math.floor(Math.random() * 200);
          await this.sleep(baseBackoffMs + jitterMs);
          chunk.status = "pending";
          queue.push(chunk);
        } else {
          const progress = this.activeProcessing.get(documentId);
          if (progress) {
            progress.chunksFailed++;
            progress.errors.push(`Chunk ${chunk.chunkIndex}: ${error.message}`);
          }
        }
      } finally {
        processing.delete(chunk.id);
        const progress = this.activeProcessing.get(documentId);
        if (progress && chunk.status === "completed") {
          progress.chunksCompleted++;
          progress.pagesProcessed += chunk.pages.length;
          progress.percentComplete = (progress.pagesProcessed / progress.totalPages) * 100;
          progress.results.push(chunk.result!);
          this.updateProgressMetrics(progress);
          this.notifyProgress(documentId, progress);
        }
      }
    };

    const inFlight = new Set<Promise<void>>();
    while (queue.length > 0 || inFlight.size > 0) {
      while (queue.length > 0 && inFlight.size < maxConcurrency) {
        const chunk = queue.shift()!;
        const p = runChunk(chunk);
        inFlight.add(p);
        p.finally(() => inFlight.delete(p));
      }
      if (inFlight.size > 0) await Promise.race(inFlight);
    }

    return results;
  }

  private async processChunk(
    chunk: DocumentChunk,
    strategy: ProcessingStrategy
  ): Promise<OCRResult> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Chunk processing timeout")), strategy.timeoutPerChunk)
    );

    const result = await Promise.race([
      this.ocrProcessChunk(chunk),
      timeout,
    ]);

    const typed = result as OCRResult;
    if (typed.status === "failed") {
      throw new Error(`Chunk OCR failed: ${typed.metadata || "unknown error"}`);
    }

    return typed;
  }

  private async ocrProcessChunk(chunk: DocumentChunk): Promise<OCRResult> {
    try {
      const worker = await tesseractPool.getWorker();
      const { data: { text } } = await (worker as any).recognize(chunk.data as any);
      tesseractPool.releaseWorker(worker as any);

      if (!text || text.trim().length === 0) {
        throw new Error("Tesseract returned empty text for chunk");
      }

      return {
        attachmentId: chunk.id,
        status: "success",
        extractedText: text,
        structuredData: "",
        metadata: "",
      };
    } catch (error: any) {
      return {
        attachmentId: chunk.id,
        status: "failed",
        extractedText: "",
        structuredData: "",
        metadata: JSON.stringify({ error: error.message, chunkId: chunk.id })
      };
    }
  }

  private async createChunks(
    file: File,
    strategy: ProcessingStrategy,
    totalPages: number
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const chunkSize = strategy.chunkSize;
    const totalChunks = Math.ceil(totalPages / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const startPage = i * chunkSize;
      const endPage = Math.min(startPage + chunkSize, totalPages);
      chunks.push({
        id: `${file.name}_chunk_${i}`,
        chunkIndex: i,
        totalChunks,
        pages: Array.from({ length: endPage - startPage }, (_, idx) => startPage + idx + 1),
        data: file,
        size: Math.floor(file.size / totalChunks),
        status: "pending",
        retryCount: 0,
      });
    }
    return chunks;
  }

  private async estimatePageCount(file: File): Promise<number> {
    const sizeMB = file.size / (1024 * 1024);
    if (file.type === "application/pdf") return Math.ceil(sizeMB * 7);
    if (file.type.startsWith("image/")) return 1;
    return Math.max(1, Math.ceil(sizeMB / 0.05));
  }

  private buildStrategy(
    partial: Partial<ProcessingStrategy>,
    totalPages: number
  ): ProcessingStrategy {
    const defaultStrategy: ProcessingStrategy = {
      chunkSize: Math.min(20, Math.max(5, Math.ceil(totalPages / 10))), // Smaller chunks for faster parallelization
      maxParallelChunks: Math.min(navigator.hardwareConcurrency || 4, 8),
      agentsToUse: ["OCR-1", "OCR-2", "OCR-3", "OCR-4"],
      loadBalancing: "round-robin",
      priority: "balanced",
      preProcessing: true,
      postProcessing: true,
      maxRetries: 3,
      timeoutPerChunk: 120000, // Increased timeout for heavy pages
      fallbackStrategy: "retry",
    };

    if (totalPages > 1000) {
      defaultStrategy.chunkSize = 50;
      defaultStrategy.maxParallelChunks = Math.min((navigator.hardwareConcurrency || 4) * 2, 12);
      defaultStrategy.priority = "speed";
    }

    return { ...defaultStrategy, ...partial };
  }

  private initializeProgress(
    documentId: string,
    totalPages: number,
    chunks: DocumentChunk[],
    strategy: ProcessingStrategy
  ): ProcessingProgress {
    return {
      documentId,
      totalPages,
      totalChunks: chunks.length,
      chunksCompleted: 0,
      chunksProcessing: 0,
      chunksFailed: 0,
      pagesProcessed: 0,
      percentComplete: 0,
      startTime: new Date(),
      elapsedTime: 0,
      averageTimePerChunk: 0,
      throughputPagesPerSecond: 0,
      activeAgents: strategy.agentsToUse.map((id) => ({ agentId: id, pagesProcessed: 0, status: "ready" })),
      results: [],
      errors: [],
    };
  }

  private updateProgressMetrics(progress: ProcessingProgress): void {
    const now = new Date();
    progress.elapsedTime = now.getTime() - progress.startTime.getTime();
    if (progress.chunksCompleted > 0) {
      progress.averageTimePerChunk = progress.elapsedTime / progress.chunksCompleted;
      const remainingChunks = progress.totalChunks - progress.chunksCompleted;
      progress.estimatedTimeRemaining = remainingChunks * progress.averageTimePerChunk;
      progress.estimatedEndTime = new Date(now.getTime() + progress.estimatedTimeRemaining);
      progress.throughputPagesPerSecond = (progress.pagesProcessed / progress.elapsedTime) * 1000;
    }
  }

  private combineResults(
    documentId: string,
    file: File,
    chunks: DocumentChunk[],
    results: Map<string, OCRResult>,
    strategy: ProcessingStrategy,
    progress: ProcessingProgress
  ): ProcessingResult {
    const successfulChunks = chunks.filter((c) => c.status === "completed").sort((a, b) => a.chunkIndex - b.chunkIndex);
    const combinedText = successfulChunks.map((c) => results.get(c.id)?.extractedText || "").join("\n\n");
    return {
      documentId,
      success: chunks.filter((c) => c.status === "failed").length === 0,
      totalPages: progress.totalPages,
      pagesProcessed: progress.pagesProcessed,
      results: Array.from(results.values()),
      combinedText,
      processingTime: progress.elapsedTime,
      strategy,
      averageConfidence: 0.85,
      errorRate: chunks.filter((c) => c.status === "failed").length / chunks.length,
      failedChunks: chunks.filter((c) => c.status === "failed"),
      errors: progress.errors,
    };
  }

  private async buildSearchIndex(results: OCRResult[]): Promise<any> {
    return buildSemanticIndex(results.map((r, idx) => ({ content: r.extractedText, timestamp: new Date(), sourceIndex: idx })));
  }

  async searchDocument(documentId: string, query: string, result: ProcessingResult): Promise<OCRResult[]> {
    if (!result.searchIndex) throw new Error("Document not indexed for search");
    return semanticSearch(query, result.searchIndex, 10).map((sr) => result.results[sr.chunkIndex]).filter(Boolean);
  }

  private generateDocumentId(file: File): string { return `${file.name}_${Date.now()}`; }

  private registerProgressCallback(documentId: string, callback: ProgressCallback): void {
    const callbacks = this.progressCallbacks.get(documentId) || [];
    callbacks.push(callback);
    this.progressCallbacks.set(documentId, callbacks);
  }

  private notifyProgress(documentId: string, progress: ProcessingProgress): void {
    const callbacks = this.progressCallbacks.get(documentId);
    if (callbacks) callbacks.forEach((cb) => cb(progress));
  }

  private updateProgress(documentId: string, updates: Partial<ProcessingProgress>): void {
    const progress = this.activeProcessing.get(documentId);
    if (progress) Object.assign(progress, updates);
  }

  async processParallelTask(
    content: string,
    instructions: string,
    type: "code" | "document" | "plan" | "general",
    onProgress?: GenerationProgressCallback
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    const sectionSize = type === "code" ? 4000 : 8000;
    const overlapSize = type === "code" ? 500 : 1000;
    const segments: string[] = [];
    
    for (let i = 0; i < content.length; i += (sectionSize - overlapSize)) {
      const end = Math.min(i + sectionSize, content.length);
      segments.push(content.substring(i, end));
      if (end === content.length) break;
    }

    const progress: GenerationProgress = {
      taskId,
      totalTasks: segments.length,
      completedTasks: 0,
      tasks: segments.map((_, idx) => ({
        id: `task-${idx}`,
        sectionTitle: `${type === "code" ? "Module" : "Section"} ${idx + 1}`,
        domain: type,
        range: [0, 0],
        status: "pending",
        assignedAgent: (["arun", "ravi", "deepa", "maya"][idx % 4]) as AgentId,
        prompt: instructions
      })),
      status: "generating",
      startTime: new Date(),
    };

    if (onProgress) onProgress(progress);

    const processedSegments = await Promise.all(
      segments.map(async (segment, idx) => {
        const task = progress.tasks[idx];
        task.status = "processing";
        if (onProgress) onProgress({ ...progress });

        try {
          const result = await this.coordinator.runAgentTask(
            task.assignedAgent,
            `${instructions}\n\nPOSITION: Segment ${idx + 1} of ${segments.length}.`,
            segment
          );
          task.status = "completed";
          task.result = result;
          progress.completedTasks++;
          if (onProgress) onProgress({ ...progress });
          return result;
        } catch (err: any) {
          task.status = "failed";
          task.error = err.message;
          return segment;
        }
      })
    );

    const finalResult = await this.recursiveHarmonize(processedSegments, instructions, type as any);
    progress.status = "completed";
    progress.endTime = new Date();
    if (onProgress) onProgress(progress);
    return finalResult;
  }

  private async recursiveHarmonize(segments: string[], instructions: string, type: "code" | "document"): Promise<string> {
    if (segments.length === 0) return "";
    if (segments.length === 1) return segments[0];

    console.log(`🧹 Recursively harmonizing ${segments.length} ${type} segments...`);
    
    // Group segments into batches for harmonization
    const batchSize = 4;
    const batches: string[][] = [];
    for (let i = 0; i < segments.length; i += batchSize) {
      batches.push(segments.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
      batches.map(async (batch, idx) => {
        const combinedBatch = batch.join(type === "code" ? "\n" : "\n\n");
        if (combinedBatch.length < 15000) {
          try {
            return await this.coordinator.runAgentTask(
              "kiran",
              `Harmonize these ${batch.length} ${type} segments (Batch ${idx + 1}/${batches.length}). Task: ${instructions}. Ensure consistency and resolve any conflicts between segments.`,
              combinedBatch
            );
          } catch (error) {
            console.warn(`Batch harmonization failed, using raw join:`, error);
            return combinedBatch;
          }
        }
        return combinedBatch;
      })
    );

    // Recursively harmonize until we have a single final result
    return this.recursiveHarmonize(batchResults, instructions, type);
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────

let largeDocumentProcessorInstance: LargeDocumentProcessor | null = null;

export function getLargeDocumentProcessor(): LargeDocumentProcessor {
  if (!largeDocumentProcessorInstance) {
    largeDocumentProcessorInstance = new LargeDocumentProcessor();
  }
  return largeDocumentProcessorInstance;
}

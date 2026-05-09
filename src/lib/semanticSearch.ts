/**
 * Semantic Search Enhancement for Context Manager
 * 
 * Adds vector-based semantic search capabilities to complement the existing
 * BM25 and keyword-based search in the context manager.
 * 
 * Features:
 * - Simple TF-IDF based semantic similarity (lightweight, no external APIs)
 * - Cosine similarity for semantic matching
 * - Topic modeling and clustering
 * - Semantic chunking with coherence scoring
 * - Query expansion and synonym matching
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface SemanticChunk {
  content: string;
  vector: Float32Array;
  topics: string[];
  coherenceScore: number;
  timestamp: Date;
  sourceIndex: number;
}

export interface SemanticSearchResult {
  chunkIndex: number;
  semanticScore: number;
  topicOverlap: number;
  coherenceBoost: number;
  finalScore: number;
}

export interface SemanticIndex {
  chunks: SemanticChunk[];
  vocabulary: Map<string, number>; // term -> global frequency
  idf: Map<string, number>; // term -> inverse document frequency
  topics: Map<string, Set<number>>; // topic -> chunk indices
  documentCount: number;
}

// ─── Stop Words (reused from contextManager) ────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "to", "of", "in", "for", "on", "with", "at",
  "by", "from", "as", "into", "through", "during", "before", "after",
  "about", "like", "also", "well", "really", "know", "think", "want",
  "just", "very", "quite", "rather", "actually", "basically", "literally",
  "um", "uh", "like", "okay", "right", "sure", "maybe", "perhaps",
]);

// ─── Text Processing ─────────────────────────────────────────────────

function tokenizeAdvanced(text: string): string[] {
  // Preserve code-like patterns (camelCase, snake_case) and handle contractions
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Split camelCase
    .toLowerCase()
    .replace(/n['’]t\b/g, " not") // Expand "don't" -> "do not"
    .replace(/['’]s\b/g, "") // Remove possessives
    .replace(/[^\w\s]/g, " ") // Replace non-word chars with space
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function extractTopics(text: string, topN: number = 5): string[] {
  const tokens = tokenizeAdvanced(text);
  const freq = new Map<string, number>();

  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);
}

function scoreVocabularyTerm(term: string, df: number, totalDocs: number): number {
  const idf = Math.log((totalDocs + 1) / (df + 1));
  const balanceScore = Math.log1p(df) * idf;
  const technicalBoost = /[_\d]/.test(term) ? 0.75 : 0;
  const lengthBoost = term.length > 8 ? 0.15 : 0;
  return balanceScore + technicalBoost + lengthBoost;
}

function collectQueryTokens(query: string): string[] {
  const baseTokens = tokenizeAdvanced(query);
  if (baseTokens.length === 0) return [];
  if (baseTokens.length > 4) return baseTokens;

  const expanded = expandQuery(query);
  return [...new Set([...baseTokens, ...expanded])];
}

// ─── TF-IDF Vector Generation ────────────────────────────────────────

function calculateTfIdfVector(
  tokens: string[],
  vocabulary: Map<string, number>,
  idf: Map<string, number>,
  vectorSize: number
): Float32Array {
  const vector = new Float32Array(vectorSize);
  const termFreq = new Map<string, number>();

  // Calculate term frequency in this document
  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) || 0) + 1);
  }

  const maxFreq = Math.max(...termFreq.values(), 1);

  // Generate TF-IDF vector
  for (const [term, count] of termFreq.entries()) {
    const vocabIndex = vocabulary.get(term);
    if (vocabIndex !== undefined && vocabIndex < vectorSize) {
      const tf = count / maxFreq; // Normalized term frequency
      const idfValue = idf.get(term) || 0;
      vector[vocabIndex] = tf * idfValue;
    }
  }

  return normalizeVector(vector);
}

function normalizeVector(vector: number[]): number[];
function normalizeVector(vector: Float32Array): Float32Array;
function normalizeVector(vector: number[] | Float32Array) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const magnitude = Math.sqrt(sum);
  if (magnitude === 0) return vector;
  for (let i = 0; i < vector.length; i++) vector[i] = vector[i] / magnitude;
  return vector;
}

// ─── Cosine Similarity ───────────────────────────────────────────────

function cosineSimilarity(vec1: ArrayLike<number>, vec2: ArrayLike<number>): number {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }

  return dotProduct; // Already normalized vectors
}

// ─── Semantic Index Building ─────────────────────────────────────────

export function buildSemanticIndex(
  chunks: Array<{ content: string; timestamp: Date; sourceIndex: number }>
): SemanticIndex {
  const vocabulary = new Map<string, number>();
  const documentFreq = new Map<string, number>();
  const topics = new Map<string, Set<number>>();
  const allTokens: string[][] = [];

  // First pass: build vocabulary and document frequency
  for (const chunk of chunks) {
    const tokens = tokenizeAdvanced(chunk.content);
    allTokens.push(tokens);

    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      documentFreq.set(token, (documentFreq.get(token) || 0) + 1);
    }
  }

  const N = chunks.length;
  const vocabularyCap = Math.min(5000, Math.max(300, Math.floor(200 + 40 * Math.sqrt(N))));

  // Build vocabulary from the most informative terms, not just the most frequent ones.
  const sortedTerms = Array.from(documentFreq.entries())
    .map(([term, df]) => ({
      term,
      df,
      score: scoreVocabularyTerm(term, df, N),
    }))
    .sort((a, b) => b.score - a.score || b.df - a.df || a.term.localeCompare(b.term))
    .slice(0, vocabularyCap);

  sortedTerms.forEach(({ term }, index) => {
    vocabulary.set(term, index);
  });

  // Calculate IDF values
  const idf = new Map<string, number>();
  for (const [term, df] of documentFreq.entries()) {
    idf.set(term, Math.log((N + 1) / (df + 1)));
  }

  // Second pass: create semantic chunks with vectors
  const semanticChunks: SemanticChunk[] = [];
  const vectorSize = vocabulary.size;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const tokens = allTokens[i];
    const vector = calculateTfIdfVector(tokens, vocabulary, idf, vectorSize);
    const topicList = extractTopics(chunk.content, 5);
    const coherenceScore = calculateCoherenceScore(chunk.content);

    semanticChunks.push({
      content: chunk.content,
      vector,
      topics: topicList,
      coherenceScore,
      timestamp: chunk.timestamp,
      sourceIndex: chunk.sourceIndex,
    });

    // Build topic index
    for (const topic of topicList) {
      if (!topics.has(topic)) {
        topics.set(topic, new Set());
      }
      topics.get(topic)!.add(i);
    }
  }

  return {
    chunks: semanticChunks,
    vocabulary,
    idf,
    topics,
    documentCount: chunks.length,
  };
}

// ─── Coherence Scoring ───────────────────────────────────────────────

function calculateCoherenceScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length < 2) return 0.5;

  let score = 0;

  // Check for discourse markers
  const discourseMarkers = [
    "however",
    "therefore",
    "furthermore",
    "moreover",
    "additionally",
    "consequently",
    "thus",
    "hence",
    "although",
    "because",
  ];

  for (const marker of discourseMarkers) {
    if (text.toLowerCase().includes(marker)) {
      score += 0.1;
    }
  }

  // Check for topic consistency (term repetition across sentences)
  const sentenceTokens = sentences.map((s) => new Set(tokenizeAdvanced(s)));
  let overlapSum = 0;
  let comparisons = 0;

  for (let i = 0; i < sentenceTokens.length - 1; i++) {
    for (let j = i + 1; j < sentenceTokens.length; j++) {
      const overlap = new Set(
        [...sentenceTokens[i]].filter((x) => sentenceTokens[j].has(x))
      );
      overlapSum += overlap.size / Math.max(sentenceTokens[i].size, 1);
      comparisons++;
    }
  }

  const avgOverlap = comparisons > 0 ? overlapSum / comparisons : 0;
  score += avgOverlap * 0.5;

  return Math.min(score, 1.0);
}

// ─── Semantic Search ─────────────────────────────────────────────────

export function semanticSearch(
  query: string,
  index: SemanticIndex,
  topK: number = 10
): SemanticSearchResult[] {
  if (index.chunks.length === 0) return [];

  // Generate query vector
  const queryTokens = collectQueryTokens(query);
  const queryVector = calculateTfIdfVector(
    queryTokens,
    index.vocabulary,
    index.idf,
    index.vocabulary.size
  );
  const queryTopics = extractTopics(query, 5);
  const queryLower = query.toLowerCase();

  const results: SemanticSearchResult[] = [];

  // Calculate semantic similarity for each chunk
  for (let i = 0; i < index.chunks.length; i++) {
    const chunk = index.chunks[i];
    const chunkText = chunk.content.toLowerCase();

    // Cosine similarity
    const semanticScore = cosineSimilarity(queryVector, chunk.vector);

    // Topic overlap bonus
    const topicOverlap =
      queryTopics.filter((t) => chunk.topics.includes(t)).length /
      Math.max(queryTopics.length, 1);

    // Lexical overlap bonus for names, technical terms, and short queries.
    const lexicalOverlap =
      queryTokens.filter((token) => token.length > 2 && chunkText.includes(token)).length /
      Math.max(queryTokens.length, 1);

    // Coherence boost for well-structured content
    const coherenceBoost = chunk.coherenceScore * 0.2;

    // Final score combines all factors
    const directMatchBoost = queryLower.length > 3 && chunkText.includes(queryLower) ? 0.18 : 0;
    const finalScore =
      semanticScore * 0.52 +
      topicOverlap * 0.16 +
      lexicalOverlap * 0.20 +
      coherenceBoost * 0.06 +
      directMatchBoost;

    if (finalScore > 0.1) {
      // Only include reasonably relevant results
      results.push({
        chunkIndex: i,
        semanticScore,
        topicOverlap,
        coherenceBoost,
        finalScore,
      });
    }
  }

  // Sort by final score and return top K
  return results.sort((a, b) => b.finalScore - a.finalScore).slice(0, topK);
}

// ─── Query Expansion ─────────────────────────────────────────────────

export function expandQuery(query: string): string[] {
  const tokens = tokenizeAdvanced(query);
  const expandedTerms = new Set(tokens);

  // Simple synonym expansion (can be enhanced with a real thesaurus)
  const synonyms: Record<string, string[]> = {
    find: ["locate", "search", "discover", "retrieve"],
    explain: ["describe", "clarify", "elucidate", "elaborate"],
    help: ["assist", "support", "aid", "guide"],
    show: ["display", "demonstrate", "present", "reveal"],
    create: ["make", "build", "generate", "construct"],
    delete: ["remove", "erase", "eliminate", "discard"],
    update: ["modify", "change", "revise", "alter"],
    compare: ["contrast", "differentiate", "evaluate", "analyze"],
    understand: ["comprehend", "grasp", "realize", "perceive"],
    improve: ["enhance", "optimize", "refine", "upgrade"],
  };

  for (const token of tokens) {
    if (synonyms[token]) {
      synonyms[token].forEach((syn) => expandedTerms.add(syn));
    }
  }

  return Array.from(expandedTerms);
}

// ─── Semantic Clustering ─────────────────────────────────────────────

export interface SemanticCluster {
  id: string;
  centroid: number[];
  chunkIndices: number[];
  representativeTopics: string[];
  coherenceScore: number;
}

export function clusterChunks(
  index: SemanticIndex,
  numClusters: number = 5
): SemanticCluster[] {
  if (index.chunks.length < numClusters) {
    // If too few chunks, each chunk is its own cluster
    return index.chunks.map((chunk, i) => ({
      id: `cluster_${i}`,
      centroid: Array.from(chunk.vector),
      chunkIndices: [i],
      representativeTopics: chunk.topics,
      coherenceScore: chunk.coherenceScore,
    }));
  }

  // Simple k-means clustering
  // Initialize centroids randomly
  const centroids: number[][] = [];
  const vectorSize = index.chunks[0].vector.length;

  for (let i = 0; i < numClusters; i++) {
    const randomIndex = Math.floor(Math.random() * index.chunks.length);
    centroids.push([...index.chunks[randomIndex].vector]);
  }

  // Iterate to convergence (max 10 iterations)
  const maxIterations = 10;
  let assignments: number[] = new Array(index.chunks.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each chunk to nearest centroid
    const newAssignments = index.chunks.map((chunk) => {
      let minDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < numClusters; c++) {
        const similarity = cosineSimilarity(chunk.vector, centroids[c]);
        const distance = 1 - similarity; // Convert similarity to distance
        if (distance < minDist) {
          minDist = distance;
          bestCluster = c;
        }
      }

      return bestCluster;
    });

    // Check for convergence
    if (newAssignments.every((a, i) => a === assignments[i])) {
      break;
    }

    assignments = newAssignments;

    // Update centroids
    for (let c = 0; c < numClusters; c++) {
      const clusterChunks = index.chunks.filter((_, i) => assignments[i] === c);
      if (clusterChunks.length > 0) {
        const newCentroid = new Array(vectorSize).fill(0);

        for (const chunk of clusterChunks) {
          for (let d = 0; d < vectorSize; d++) {
            newCentroid[d] += chunk.vector[d];
          }
        }

        for (let d = 0; d < vectorSize; d++) {
          newCentroid[d] /= clusterChunks.length;
        }

        centroids[c] = normalizeVector(newCentroid);
      }
    }
  }

  // Build cluster results
  const clusters: SemanticCluster[] = [];

  for (let c = 0; c < numClusters; c++) {
    const chunkIndices = assignments
      .map((a, i) => (a === c ? i : -1))
      .filter((i) => i >= 0);

    if (chunkIndices.length === 0) continue;

    // Extract representative topics
    const allTopics = chunkIndices.flatMap((i) => index.chunks[i].topics);
    const topicFreq = new Map<string, number>();
    for (const topic of allTopics) {
      topicFreq.set(topic, (topicFreq.get(topic) || 0) + 1);
    }

    const representativeTopics = Array.from(topicFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    // Average coherence
    const avgCoherence =
      chunkIndices.reduce((sum, i) => sum + index.chunks[i].coherenceScore, 0) /
      chunkIndices.length;

    clusters.push({
      id: `cluster_${c}`,
      centroid: centroids[c],
      chunkIndices,
      representativeTopics,
      coherenceScore: avgCoherence,
    });
  }

  return clusters;
}

// ─── Hybrid Search (Combine BM25 + Semantic) ────────────────────────

export function hybridSearchScore(
  bm25Score: number,
  semanticScore: number,
  alpha: number = 0.6
): number {
  // alpha controls the balance: 0 = pure semantic, 1 = pure BM25
  return alpha * bm25Score + (1 - alpha) * semanticScore;
}

import {
  BASIS_POINTS_SCALE,
  divideRoundHalfAwayFromZero,
  integerSquareRoot,
  safeIntegerFromBigInt
} from "../statistics/index.js";
import { jaroWinklerSimilarityBps } from "./similarity.js";

export const SOFT_TF_IDF_MAX_CORPUS_DOCUMENTS = 2_000;
export const SOFT_TF_IDF_MAX_TOKENS_PER_DOCUMENT = 64;
export const SOFT_TF_IDF_MAX_TOKEN_CODE_POINTS = 128;
export const SOFT_TF_IDF_DEFAULT_TOKEN_THRESHOLD_BPS = 9_000;

export type SoftTfIdfOptions = Readonly<{
  tokenSimilarityThresholdBps?: number;
}>;

type WeightedToken = Readonly<{
  token: string;
  weight: bigint;
}>;

type TokenPair = Readonly<{
  left: WeightedToken;
  right: WeightedToken;
  similarityBps: number;
  canonicalFirst: string;
  canonicalSecond: string;
}>;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeTokens(tokens: readonly string[], label: string): string[] {
  if (tokens.length > SOFT_TF_IDF_MAX_TOKENS_PER_DOCUMENT) {
    throw new RangeError(
      `${label} exceeds the ${SOFT_TF_IDF_MAX_TOKENS_PER_DOCUMENT}-token limit.`
    );
  }
  return tokens
    .map((token) => {
      const normalized = token.normalize("NFKC");
      if (Array.from(normalized).length > SOFT_TF_IDF_MAX_TOKEN_CODE_POINTS) {
        throw new RangeError(
          `${label} contains a token over the ${SOFT_TF_IDF_MAX_TOKEN_CODE_POINTS}-code-point limit.`
        );
      }
      return normalized;
    })
    .filter((token) => token !== "");
}

function termFrequencies(tokens: readonly string[]): ReadonlyMap<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

function documentFrequencies(corpus: readonly (readonly string[])[]): ReadonlyMap<string, number> {
  if (corpus.length > SOFT_TF_IDF_MAX_CORPUS_DOCUMENTS) {
    throw new RangeError(`corpus exceeds the ${SOFT_TF_IDF_MAX_CORPUS_DOCUMENTS}-document limit.`);
  }

  const frequencies = new Map<string, number>();
  for (let index = 0; index < corpus.length; index += 1) {
    const document = corpus[index];
    if (document === undefined) continue;
    const tokens = normalizeTokens(document, `corpus document ${index}`);
    for (const token of new Set(tokens)) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }
  return frequencies;
}

function weightedTokens(
  tokens: readonly string[],
  corpusDocumentCount: number,
  documentFrequency: ReadonlyMap<string, number>
): WeightedToken[] {
  const frequencies = termFrequencies(tokens);
  const weighted: WeightedToken[] = [];
  for (const [token, frequency] of frequencies) {
    const documentCount = BigInt(corpusDocumentCount + 1);
    const tokenDocumentCount = BigInt((documentFrequency.get(token) ?? 0) + 1);
    const idfBps = divideRoundHalfAwayFromZero(
      documentCount * BigInt(BASIS_POINTS_SCALE),
      tokenDocumentCount
    );
    weighted.push({ token, weight: BigInt(frequency) * idfBps });
  }
  return weighted.sort((left, right) => compareStrings(left.token, right.token));
}

function tokenPairs(
  left: readonly WeightedToken[],
  right: readonly WeightedToken[],
  thresholdBps: number
): TokenPair[] {
  const pairs: TokenPair[] = [];
  for (const leftToken of left) {
    for (const rightToken of right) {
      const similarityBps = jaroWinklerSimilarityBps(leftToken.token, rightToken.token);
      if (similarityBps < thresholdBps) continue;
      const canonicalFirst =
        compareStrings(leftToken.token, rightToken.token) <= 0 ? leftToken.token : rightToken.token;
      const canonicalSecond =
        canonicalFirst === leftToken.token ? rightToken.token : leftToken.token;
      pairs.push({
        left: leftToken,
        right: rightToken,
        similarityBps,
        canonicalFirst,
        canonicalSecond
      });
    }
  }
  return pairs.sort((left, right) => {
    if (left.similarityBps !== right.similarityBps) {
      return right.similarityBps - left.similarityBps;
    }
    const firstOrder = compareStrings(left.canonicalFirst, right.canonicalFirst);
    return firstOrder !== 0
      ? firstOrder
      : compareStrings(left.canonicalSecond, right.canonicalSecond);
  });
}

function squaredNorm(tokens: readonly WeightedToken[]): bigint {
  let sum = 0n;
  for (const token of tokens) sum += token.weight * token.weight;
  return sum;
}

/**
 * Bounded Soft TF-IDF similarity for a caller-supplied personal corpus.
 * Smoothed inverse-document-frequency weights and all similarity math are integer fixed point.
 */
export function softTfIdfSimilarityBps(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
  corpus: readonly (readonly string[])[],
  options: SoftTfIdfOptions = {}
): number {
  const thresholdBps =
    options.tokenSimilarityThresholdBps ?? SOFT_TF_IDF_DEFAULT_TOKEN_THRESHOLD_BPS;
  if (!Number.isSafeInteger(thresholdBps) || thresholdBps < 0 || thresholdBps > 10_000) {
    throw new RangeError("tokenSimilarityThresholdBps must be between 0 and 10,000.");
  }

  const left = normalizeTokens(leftTokens, "left document");
  const right = normalizeTokens(rightTokens, "right document");
  const documentFrequency = documentFrequencies(corpus);
  if (left.length === 0 && right.length === 0) return BASIS_POINTS_SCALE;
  if (left.length === 0 || right.length === 0) return 0;

  const weightedLeft = weightedTokens(left, corpus.length, documentFrequency);
  const weightedRight = weightedTokens(right, corpus.length, documentFrequency);
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  let numerator = 0n;
  for (const pair of tokenPairs(weightedLeft, weightedRight, thresholdBps)) {
    if (usedLeft.has(pair.left.token) || usedRight.has(pair.right.token)) continue;
    usedLeft.add(pair.left.token);
    usedRight.add(pair.right.token);
    numerator += pair.left.weight * pair.right.weight * BigInt(pair.similarityBps);
  }
  if (numerator === 0n) return 0;

  const denominator = integerSquareRoot(squaredNorm(weightedLeft) * squaredNorm(weightedRight));
  const score = safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(numerator, denominator),
    "Soft TF-IDF score"
  );
  return Math.min(BASIS_POINTS_SCALE, score);
}

import {
  BASIS_POINTS_SCALE,
  boundedRatioBasisPoints,
  divideRoundHalfAwayFromZero,
  safeIntegerFromBigInt
} from "../statistics/index.js";

export type JaroWinklerOptions = Readonly<{
  minimumJaroBps?: number;
  maxPrefixLength?: number;
  prefixScaleBps?: number;
}>;

const DEFAULT_MINIMUM_JARO_BPS = 7_000;
const DEFAULT_MAX_PREFIX_LENGTH = 4;
const DEFAULT_PREFIX_SCALE_BPS = 1_000;
const MAX_PREFIX_LENGTH = 4;
const MAX_PREFIX_SCALE_BPS = 1_000;

function canonicalCodePoints(value: string): string[] {
  return Array.from(value.normalize("NFKC"));
}

function normalizedTokenSet(tokens: readonly string[]): ReadonlySet<string> {
  const normalized = tokens.map((token) => token.normalize("NFKC")).filter((token) => token !== "");
  return new Set(normalized);
}

function scoreFraction(numerator: bigint, denominator: bigint): number {
  const score = divideRoundHalfAwayFromZero(numerator * BigInt(BASIS_POINTS_SCALE), denominator);
  return safeIntegerFromBigInt(score, "similarity score");
}

/** Distinct-token Jaccard similarity in basis points. */
export function jaccardSimilarityBps(
  leftTokens: readonly string[],
  rightTokens: readonly string[]
): number {
  const left = normalizedTokenSet(leftTokens);
  const right = normalizedTokenSet(rightTokens);
  if (left.size === 0 && right.size === 0) return BASIS_POINTS_SCALE;

  let intersectionSize = 0;
  for (const token of left) {
    if (right.has(token)) intersectionSize += 1;
  }
  const unionSize = left.size + right.size - intersectionSize;
  return boundedRatioBasisPoints(intersectionSize, unionSize);
}

/** Jaro string similarity in basis points, calculated without floating point. */
export function jaroSimilarityBps(leftValue: string, rightValue: string): number {
  const left = canonicalCodePoints(leftValue);
  const right = canonicalCodePoints(rightValue);
  if (left.join("") === right.join("")) return BASIS_POINTS_SCALE;
  if (left.length === 0 || right.length === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftMatched = new Array<boolean>(left.length).fill(false);
  const rightMatched = new Array<boolean>(right.length).fill(false);
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftCharacter = left[leftIndex];
    if (leftCharacter === undefined) continue;
    const start = Math.max(0, leftIndex - matchDistance);
    const end = Math.min(right.length, leftIndex + matchDistance + 1);
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatched[rightIndex] === true || right[rightIndex] !== leftCharacter) continue;
      leftMatched[leftIndex] = true;
      rightMatched[rightIndex] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  const leftSequence: string[] = [];
  const rightSequence: string[] = [];
  for (let index = 0; index < left.length; index += 1) {
    const character = left[index];
    if (leftMatched[index] === true && character !== undefined) leftSequence.push(character);
  }
  for (let index = 0; index < right.length; index += 1) {
    const character = right[index];
    if (rightMatched[index] === true && character !== undefined) rightSequence.push(character);
  }

  let transpositionMismatches = 0;
  for (let index = 0; index < leftSequence.length; index += 1) {
    if (leftSequence[index] !== rightSequence[index]) transpositionMismatches += 1;
  }

  const matchCount = BigInt(matches);
  const leftLength = BigInt(left.length);
  const rightLength = BigInt(right.length);
  const doubledMatches = matchCount * 2n;
  const numerator =
    matchCount * rightLength * doubledMatches +
    matchCount * leftLength * doubledMatches +
    (doubledMatches - BigInt(transpositionMismatches)) * leftLength * rightLength;
  const denominator = leftLength * rightLength * doubledMatches * 3n;
  return Math.min(BASIS_POINTS_SCALE, scoreFraction(numerator, denominator));
}

function validateJaroWinklerOptions(options: JaroWinklerOptions): Required<JaroWinklerOptions> {
  const minimumJaroBps = options.minimumJaroBps ?? DEFAULT_MINIMUM_JARO_BPS;
  const maxPrefixLength = options.maxPrefixLength ?? DEFAULT_MAX_PREFIX_LENGTH;
  const prefixScaleBps = options.prefixScaleBps ?? DEFAULT_PREFIX_SCALE_BPS;
  if (!Number.isSafeInteger(minimumJaroBps) || minimumJaroBps < 0 || minimumJaroBps > 10_000) {
    throw new RangeError("minimumJaroBps must be an integer between 0 and 10,000.");
  }
  if (
    !Number.isSafeInteger(maxPrefixLength) ||
    maxPrefixLength < 0 ||
    maxPrefixLength > MAX_PREFIX_LENGTH
  ) {
    throw new RangeError("maxPrefixLength must be an integer between 0 and 4.");
  }
  if (
    !Number.isSafeInteger(prefixScaleBps) ||
    prefixScaleBps < 0 ||
    prefixScaleBps > MAX_PREFIX_SCALE_BPS
  ) {
    throw new RangeError("prefixScaleBps must be an integer between 0 and 1,000.");
  }
  return { minimumJaroBps, maxPrefixLength, prefixScaleBps };
}

/** Jaro-Winkler similarity with the conventional four-character, 0.1-per-character cap. */
export function jaroWinklerSimilarityBps(
  leftValue: string,
  rightValue: string,
  options: JaroWinklerOptions = {}
): number {
  const settings = validateJaroWinklerOptions(options);
  const jaroBps = jaroSimilarityBps(leftValue, rightValue);
  if (jaroBps < settings.minimumJaroBps || jaroBps === BASIS_POINTS_SCALE) {
    return jaroBps;
  }

  const left = canonicalCodePoints(leftValue);
  const right = canonicalCodePoints(rightValue);
  let prefixLength = 0;
  const prefixLimit = Math.min(settings.maxPrefixLength, left.length, right.length);
  while (prefixLength < prefixLimit && left[prefixLength] === right[prefixLength]) {
    prefixLength += 1;
  }

  const bonus = safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(
      BigInt(BASIS_POINTS_SCALE - jaroBps) * BigInt(prefixLength) * BigInt(settings.prefixScaleBps),
      BigInt(BASIS_POINTS_SCALE)
    ),
    "Jaro-Winkler prefix bonus"
  );
  return Math.min(BASIS_POINTS_SCALE, jaroBps + bonus);
}

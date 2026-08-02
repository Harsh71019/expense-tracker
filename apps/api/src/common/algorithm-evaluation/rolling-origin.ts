import { requireSafeInteger } from "../statistics/index.js";

export interface ChronologicalPoint<T> {
  /** Strictly increasing integer time bucket, such as an epoch day or week. */
  readonly time: number;
  readonly value: T;
}

export interface ChronologicalSplit<T> {
  readonly training: readonly ChronologicalPoint<T>[];
  readonly test: readonly ChronologicalPoint<T>[];
  readonly originTime: number;
  readonly targetStartTime: number;
  readonly targetEndTime: number;
}

export interface RollingOriginOptions {
  readonly minimumTrainingSize: number;
  readonly horizonSize: number;
  readonly stepSize: number;
  readonly maxOrigins: number;
}

export interface RollingOriginPlan<T> {
  readonly splits: readonly ChronologicalSplit<T>[];
  readonly eligibleOriginCount: number;
  readonly evaluatedOriginCount: number;
  /** Oldest eligible origins omitted by maxOrigins; never silently hidden. */
  readonly skippedOriginCount: number;
}

function requirePositiveInteger(value: number, label: string): void {
  requireSafeInteger(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
}

function validatePoints<T>(points: readonly ChronologicalPoint<T>[]): void {
  let previousTime: number | null = null;
  for (const point of points) {
    requireSafeInteger(point.time, "chronological point time");
    if (previousTime !== null && point.time <= previousTime) {
      throw new RangeError("chronological point times must be strictly increasing.");
    }
    previousTime = point.time;
  }
}

function createSplit<T>(
  points: readonly ChronologicalPoint<T>[],
  trainingEnd: number,
  horizonSize: number
): ChronologicalSplit<T> {
  const training = points.slice(0, trainingEnd);
  const test = points.slice(trainingEnd, trainingEnd + horizonSize);
  return {
    training,
    test,
    originTime: Math.max(...training.map((point) => point.time)),
    targetStartTime: Math.min(...test.map((point) => point.time)),
    targetEndTime: Math.max(...test.map((point) => point.time))
  };
}

/** A single newest-period holdout for chronological classification evaluation. */
export function buildChronologicalHoldout<T>(
  points: readonly ChronologicalPoint<T>[],
  holdoutSize: number
): ChronologicalSplit<T> | null {
  requirePositiveInteger(holdoutSize, "holdoutSize");
  validatePoints(points);
  if (points.length <= holdoutSize) return null;
  return createSplit(points, points.length - holdoutSize, holdoutSize);
}

/**
 * Builds expanding rolling origins. If maxOrigins binds, the newest complete
 * decision windows are retained and skippedOriginCount discloses the budget hit.
 */
export function buildRollingOriginPlan<T>(
  points: readonly ChronologicalPoint<T>[],
  options: RollingOriginOptions
): RollingOriginPlan<T> {
  requirePositiveInteger(options.minimumTrainingSize, "minimumTrainingSize");
  requirePositiveInteger(options.horizonSize, "horizonSize");
  requirePositiveInteger(options.stepSize, "stepSize");
  requirePositiveInteger(options.maxOrigins, "maxOrigins");
  validatePoints(points);

  const trainingEnds: number[] = [];
  for (
    let trainingEnd = options.minimumTrainingSize;
    trainingEnd + options.horizonSize <= points.length;
    trainingEnd += options.stepSize
  ) {
    trainingEnds.push(trainingEnd);
  }

  const skippedOriginCount = Math.max(0, trainingEnds.length - options.maxOrigins);
  const evaluatedTrainingEnds = trainingEnds.slice(skippedOriginCount);
  const splits = evaluatedTrainingEnds.map((trainingEnd) =>
    createSplit(points, trainingEnd, options.horizonSize)
  );

  return {
    splits,
    eligibleOriginCount: trainingEnds.length,
    evaluatedOriginCount: splits.length,
    skippedOriginCount
  };
}

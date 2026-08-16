import type { AlgorithmResourceContract } from "@treasury-ops/shared";

export const DETECTOR_VERSION = 1;
export const SCORING_POLICY_VERSION = 1;

export const SPENDING_CHANGE_RESOURCE_CONTRACT: AlgorithmResourceContract = {
  lookbackDays: 365,
  maxRows: 10_000,
  batchSize: 200,
  expectedComplexity: "linear",
  timeoutMs: 30_000,
  degradedMode: "return_resource_limit"
} as const;

export const RECURRING_CHANGE_CONFIG = {
  minPreShiftObservations: 3,
  minPostShiftObservations: 2,
  minPersistenceStates: 2,
  minAbsoluteDeltaMinor: 5_000, // 50 INR
  minRelativeDeltaBps: 500 // 5.00%
} as const;

export const VARIABLE_SPENDING_REGIME_CONFIG = {
  bucketDays: 7, // weekly IST periods
  minBaselineBuckets: 6,
  minPostShiftBuckets: 3,
  minPersistenceBuckets: 2,
  minAbsoluteDeltaMinor: 50_000, // 500 INR
  minRelativeDeltaBps: 1_000 // 10.00%
} as const;

export const SPENDING_CHANGE_QUEUE_NAME = "spending-change-detection";
export const SPENDING_CHANGE_JOB_NAME = "detect-spending-changes";
export const SPENDING_CHANGE_DISCOVERY_BATCH_SIZE = 50;

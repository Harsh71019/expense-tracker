import type { AlgorithmResourceContract } from "@treasury-ops/shared";

export const RECURRING_DETECTOR_VERSION = 1;
export const RECURRING_DETECTION_POLICY_VERSION = 1;
export const RECURRING_DETECTION_ALGORITHM_KEY = "recurring_detection";
export const RECURRING_DETECTION_ROLLOUT_MODE = "shadow" as const;

/** Ordinary worker ceiling; annual hypotheses remain available to bounded offline evaluation. */
export const RECURRING_DETECTION_RESOURCE_CONTRACT: AlgorithmResourceContract = {
  lookbackDays: 365,
  maxRows: 5_000,
  batchSize: 200,
  expectedComplexity: "n_log_n",
  timeoutMs: 30_000,
  degradedMode: "return_resource_limit"
};

export const RECURRING_DETECTION_DISCOVERY_BATCH_SIZE = 200;
export const MINIMUM_OBSERVATIONS = 2;
export const MINIMUM_PROMOTION_WINDOWS = 4;
export const PROMOTION_PRECISION_FLOOR_BPS = 8_000;

export const CADENCE_DEFINITIONS = {
  weekly: { intervalDays: 7, graceDays: 2, minMatureOccurrences: 3, minSpanDays: 12 },
  biweekly: { intervalDays: 14, graceDays: 3, minMatureOccurrences: 3, minSpanDays: 24 },
  semimonthly: { intervalDays: 15, graceDays: 3, minMatureOccurrences: 4, minSpanDays: 40 },
  monthly: { intervalDays: 30, graceDays: 5, minMatureOccurrences: 3, minSpanDays: 50 },
  quarterly: { intervalDays: 91, graceDays: 10, minMatureOccurrences: 3, minSpanDays: 150 },
  annual: { intervalDays: 365, graceDays: 15, minMatureOccurrences: 2, minSpanDays: 330 }
} as const;

export const SCORING_WEIGHTS = {
  coverageWeight: 3_000,
  dateStabilityWeight: 3_000,
  amountStabilityWeight: 2_000,
  textStabilityWeight: 1_000,
  missPenaltyWeight: 1_000
} as const;

export const CANDIDATE_THRESHOLD_BPS = 4_500;
export const MATURE_THRESHOLD_BPS = 6_500;
export const CADENCE_SELECTION_THRESHOLD_BPS = 5_000;
export const CADENCE_SAFETY_MARGIN_BPS = 500;
export const FIXED_AMOUNT_THRESHOLD_BPS = 500;
export const STALE_GRACE_MULTIPLIER = 2;
export const GROUP_AMOUNT_SPLIT_MIN_MINOR = 50_000;
export const GROUP_AMOUNT_SPLIT_GAP_BPS = 5_000;

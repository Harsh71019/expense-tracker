import type { AlgorithmResourceContract } from "@treasury-ops/shared";

export const CASHFLOW_FORECAST_VERSION = 1;
export const CASHFLOW_FORECAST_RESOURCE_CONTRACT: AlgorithmResourceContract = {
  lookbackDays: 365,
  maxRows: 5_000,
  batchSize: 200,
  expectedComplexity: "bounded_quadratic",
  timeoutMs: 30_000,
  degradedMode: "return_resource_limit"
};
export const CASHFLOW_FORECAST_MINIMUM_DAYS = 35;
export const CASHFLOW_FORECAST_MINIMUM_ORIGINS = 4;

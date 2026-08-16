import {
  discreteMedian,
  discreteQuantile,
  divideRoundHalfAwayFromZero,
  safeIntegerFromBigInt
} from "../../common/statistics/index.js";

export type ForecastModel =
  "seasonal_naive" | "trailing_median" | "ses" | "croston" | "sba" | "tsb";
export interface ModelEvaluation {
  readonly model: ForecastModel;
  readonly maeMinor: number;
  readonly residuals: readonly number[];
  readonly origins: number;
}

const ALPHA_BPS = [2_000, 5_000, 8_000] as const;
const MIN_ORIGINS = 4;

function requireSeries(values: readonly number[]): void {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new RangeError("forecast series must contain non-negative safe integers");
}
function rounded(value: bigint, label: string): number {
  return safeIntegerFromBigInt(value, label);
}
function medianForecast(history: readonly number[]): number {
  return discreteMedian(history.slice(Math.max(0, history.length - 8)));
}
function seasonalForecast(history: readonly number[]): number {
  return history.at(-7) ?? history.at(-1) ?? 0;
}
function sesForecast(history: readonly number[], alphaBps: number): number {
  let level = history[0] ?? 0;
  for (const value of history.slice(1))
    level = rounded(
      divideRoundHalfAwayFromZero(
        BigInt(alphaBps) * BigInt(value) + BigInt(10_000 - alphaBps) * BigInt(level),
        10_000n
      ),
      "ses level"
    );
  return level;
}
function intermittentForecast(history: readonly number[], kind: "croston" | "sba" | "tsb"): number {
  const alpha = 2_000n;
  let size = 0n;
  let interval = 1n;
  let probability = 0n;
  let since = 0n;
  for (const value of history) {
    since += 1n;
    if (value > 0) {
      size =
        size === 0n
          ? BigInt(value)
          : divideRoundHalfAwayFromZero(alpha * BigInt(value) + (10_000n - alpha) * size, 10_000n);
      interval =
        interval === 0n
          ? since
          : divideRoundHalfAwayFromZero(alpha * since + (10_000n - alpha) * interval, 10_000n);
      probability = divideRoundHalfAwayFromZero(
        alpha * 10_000n + (10_000n - alpha) * probability,
        10_000n
      );
      since = 0n;
    } else probability = divideRoundHalfAwayFromZero((10_000n - alpha) * probability, 10_000n);
  }
  if (kind === "tsb")
    return rounded(divideRoundHalfAwayFromZero(size * probability, 100_000_000n), "tsb forecast");
  const croston = interval === 0n ? 0n : divideRoundHalfAwayFromZero(size, interval);
  return rounded(
    kind === "sba" ? divideRoundHalfAwayFromZero(croston * 9_000n, 10_000n) : croston,
    "intermittent forecast"
  );
}
export function isSparseEligible(values: readonly number[]): boolean {
  requireSeries(values);
  const nonZero = values.filter((value) => value > 0).length;
  return values.length >= 56 && nonZero >= 4 && nonZero * 2 <= values.length;
}
export function forecastOne(model: ForecastModel, history: readonly number[]): number {
  requireSeries(history);
  if (history.length === 0) return 0;
  if (model === "seasonal_naive") return seasonalForecast(history);
  if (model === "trailing_median") return medianForecast(history);
  if (model === "ses") return Math.min(...ALPHA_BPS.map((alpha) => sesForecast(history, alpha)));
  return intermittentForecast(history, model);
}
export function selectForecastModel(values: readonly number[]): ModelEvaluation | null {
  requireSeries(values);
  if (values.length < 35) return null;
  const models: ForecastModel[] = ["seasonal_naive", "trailing_median", "ses"];
  if (isSparseEligible(values)) models.push("croston", "sba", "tsb");
  const evaluated = models
    .map((model): ModelEvaluation => {
      const residuals: number[] = [];
      for (let origin = 28; origin < values.length; origin += 7) {
        const actual = values[origin];
        if (actual === undefined) continue;
        residuals.push(actual - forecastOne(model, values.slice(0, origin)));
      }
      const mae =
        residuals.length === 0
          ? Number.MAX_SAFE_INTEGER
          : rounded(
              residuals.reduce(
                (sum, value) => sum + (value < 0 ? -BigInt(value) : BigInt(value)),
                0n
              ) / BigInt(residuals.length),
              "mae"
            );
      return { model, maeMinor: mae, residuals, origins: residuals.length };
    })
    .filter((entry) => entry.origins >= MIN_ORIGINS);
  if (evaluated.length === 0) return null;
  return (
    evaluated.sort(
      (left, right) =>
        left.maeMinor - right.maeMinor || models.indexOf(left.model) - models.indexOf(right.model)
    )[0] ?? null
  );
}
export function calibratedRange(
  pointMinor: number,
  residuals: readonly number[]
): Readonly<{ lowerMinor: number; upperMinor: number; coverageBps: number | null }> {
  if (residuals.length < MIN_ORIGINS)
    return { lowerMinor: pointMinor, upperMinor: pointMinor, coverageBps: null };
  const lower = Math.max(0, pointMinor + discreteQuantile(residuals, 1_000));
  const upper = Math.max(0, pointMinor + discreteQuantile(residuals, 9_000));
  let covered = 0;
  for (const residual of residuals)
    if (
      residual >= discreteQuantile(residuals, 1_000) &&
      residual <= discreteQuantile(residuals, 9_000)
    )
      covered += 1;
  return {
    lowerMinor: lower,
    upperMinor: upper,
    coverageBps: rounded((BigInt(covered) * 10_000n) / BigInt(residuals.length), "coverage")
  };
}

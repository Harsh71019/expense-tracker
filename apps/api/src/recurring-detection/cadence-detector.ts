import type { DetectedStreamCadence } from "@treasury-ops/shared";

import {
  BASIS_POINTS_SCALE,
  boundedRatioBasisPoints,
  discreteMedian,
  divideRoundHalfAwayFromZero,
  medianAbsoluteDeviation,
  requireSafeInteger,
  safeIntegerFromBigInt
} from "../common/statistics/index.js";
import {
  CADENCE_DEFINITIONS,
  CADENCE_SAFETY_MARGIN_BPS,
  CADENCE_SELECTION_THRESHOLD_BPS,
  MINIMUM_OBSERVATIONS
} from "./recurring-detection.constants.js";

export interface CadenceAlignment {
  readonly observationDate: string;
  readonly expectedDate: string;
  readonly residualDays: number;
}

export interface CadenceScoreResult {
  readonly cadence: DetectedStreamCadence;
  readonly coverageBps: number;
  readonly dateStabilityBps: number;
  readonly missPenaltyBps: number;
  readonly intervalMedianDays: number;
  readonly intervalMadDays: number;
  readonly expectedSlotCount: number;
  readonly matchedSlotCount: number;
  readonly recentMissCount: number;
  readonly selectionScoreBps: number;
  readonly alignments: readonly CadenceAlignment[];
}

export interface CadenceDetectionResult {
  readonly bestCadence: DetectedStreamCadence | null;
  readonly bestScore: CadenceScoreResult | null;
  readonly cadenceMarginBps: number;
  readonly ambiguous: boolean;
  readonly scores: readonly CadenceScoreResult[];
}

const MILLISECONDS_PER_DAY = 86_400_000;
const CADENCES: readonly DetectedStreamCadence[] = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "annual"
];

function parseDateToEpochDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError("recurring cadence date must use YYYY-MM-DD.");
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const epochDay = Math.floor(Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY);
  if (epochDayToDate(epochDay) !== value) {
    throw new RangeError("recurring cadence date must be a valid calendar date.");
  }
  return epochDay;
}

function epochDayToDate(epochDay: number): string {
  const date = new Date(epochDay * MILLISECONDS_PER_DAY);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isEndOfMonth(date: string): boolean {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return Number(date.slice(8, 10)) === daysInMonth(year, month);
}

function addMonths(anchorDate: string, monthsToAdd: number): string {
  const anchorYear = Number(anchorDate.slice(0, 4));
  const anchorMonth = Number(anchorDate.slice(5, 7));
  const anchorDay = Number(anchorDate.slice(8, 10));
  const zeroBasedTarget = anchorYear * 12 + (anchorMonth - 1) + monthsToAdd;
  const targetYear = Math.floor(zeroBasedTarget / 12);
  const targetMonth = zeroBasedTarget - targetYear * 12 + 1;
  const targetDay = isEndOfMonth(anchorDate)
    ? daysInMonth(targetYear, targetMonth)
    : Math.min(anchorDay, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function cadenceSlot(anchorDate: string, cadence: DetectedStreamCadence, slot: number): string {
  requireSafeInteger(slot, "cadence slot");
  switch (cadence) {
    case "weekly":
      return epochDayToDate(parseDateToEpochDay(anchorDate) + slot * 7);
    case "biweekly":
      return epochDayToDate(parseDateToEpochDay(anchorDate) + slot * 14);
    case "semimonthly": {
      if (slot === 0) return anchorDate;
      const anchorYear = Number(anchorDate.slice(0, 4));
      const anchorMonth = Number(anchorDate.slice(5, 7));
      const anchorDay = Number(anchorDate.slice(8, 10));
      const halfMonthIndex =
        anchorYear * 24 + (anchorMonth - 1) * 2 + (anchorDay > 15 ? 1 : 0) + slot;
      const targetYear = Math.floor(halfMonthIndex / 24);
      const withinYear = halfMonthIndex - targetYear * 24;
      const targetMonth = Math.floor(withinYear / 2) + 1;
      const targetDay = withinYear % 2 === 0 ? 1 : 15;
      return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
    }
    case "monthly":
      return addMonths(anchorDate, slot);
    case "quarterly":
      return addMonths(anchorDate, slot * 3);
    case "annual":
      return addMonths(anchorDate, slot * 12);
  }
}

export function alignObservationsToCadence(
  dates: readonly string[],
  cadence: DetectedStreamCadence
): readonly CadenceAlignment[] {
  if (dates.length < MINIMUM_OBSERVATIONS) return [];
  const sortedDates = [...dates].sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates.at(-1);
  if (firstDate === undefined || lastDate === undefined) return [];
  const expectedSlots: string[] = [];
  for (let slot = 0; slot < 500; slot += 1) {
    const expected = cadenceSlot(firstDate, cadence, slot);
    expectedSlots.push(expected);
    if (expected >= lastDate) break;
  }

  const graceDays = CADENCE_DEFINITIONS[cadence].graceDays;
  const usedSlots = new Set<number>();
  const alignments: CadenceAlignment[] = [];
  for (const observationDate of sortedDates) {
    const observationDay = parseDateToEpochDay(observationDate);
    let bestIndex: number | null = null;
    let bestAbsoluteResidual = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < expectedSlots.length; index += 1) {
      if (usedSlots.has(index)) continue;
      const expected = expectedSlots[index];
      if (expected === undefined) continue;
      const residual = observationDay - parseDateToEpochDay(expected);
      const absoluteResidual = Math.abs(residual);
      if (absoluteResidual <= graceDays && absoluteResidual < bestAbsoluteResidual) {
        bestIndex = index;
        bestAbsoluteResidual = absoluteResidual;
      }
    }
    if (bestIndex === null) continue;
    const expectedDate = expectedSlots[bestIndex];
    if (expectedDate === undefined) continue;
    usedSlots.add(bestIndex);
    alignments.push({
      observationDate,
      expectedDate,
      residualDays: observationDay - parseDateToEpochDay(expectedDate)
    });
  }
  return alignments;
}

export function scoreCadence(
  dates: readonly string[],
  cadence: DetectedStreamCadence,
  asOfDate: string
): CadenceScoreResult {
  parseDateToEpochDay(asOfDate);
  const sortedDates = [...dates].sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates.at(-1);
  const alignments = alignObservationsToCadence(sortedDates, cadence);
  if (firstDate === undefined || lastDate === undefined || alignments.length === 0) {
    return emptyScore(cadence);
  }

  const expectedSlots = countSlotsThrough(firstDate, cadence, lastDate);
  const coverageDenominator = Math.max(expectedSlots, sortedDates.length);
  const coverageBps = boundedRatioBasisPoints(
    Math.min(alignments.length, coverageDenominator),
    coverageDenominator
  );
  const graceDays = CADENCE_DEFINITIONS[cadence].graceDays;
  const medianResidual = discreteMedian(
    alignments.map((alignment) => Math.abs(alignment.residualDays))
  );
  const dateStabilityBps =
    BASIS_POINTS_SCALE - boundedRatioBasisPoints(Math.min(medianResidual, graceDays), graceDays);
  const recentMissCount = countRecentMisses(lastDate, cadence, asOfDate);
  const missPenaltyBps = Math.min(BASIS_POINTS_SCALE, recentMissCount * 3_333);
  const intervals = intervalDays(sortedDates);
  const selectionScoreBps = safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(
      BigInt(coverageBps) * 6_000n + BigInt(dateStabilityBps) * 4_000n,
      10_000n
    ),
    "cadence selection score"
  );

  return {
    cadence,
    coverageBps,
    dateStabilityBps,
    missPenaltyBps,
    intervalMedianDays:
      intervals.length === 0
        ? CADENCE_DEFINITIONS[cadence].intervalDays
        : discreteMedian(intervals),
    intervalMadDays: intervals.length === 0 ? 0 : medianAbsoluteDeviation(intervals),
    expectedSlotCount: expectedSlots,
    matchedSlotCount: alignments.length,
    recentMissCount,
    selectionScoreBps,
    alignments
  };
}

export function detectCadence(dates: readonly string[], asOfDate: string): CadenceDetectionResult {
  if (dates.length < MINIMUM_OBSERVATIONS) {
    return {
      bestCadence: null,
      bestScore: null,
      cadenceMarginBps: 0,
      ambiguous: false,
      scores: []
    };
  }
  const scores = CADENCES.map((cadence) => scoreCadence(dates, cadence, asOfDate));
  const ranked = [...scores].sort(
    (left, right) =>
      right.selectionScoreBps - left.selectionScoreBps || left.cadence.localeCompare(right.cadence)
  );
  const best = ranked[0];
  const second = ranked[1];
  if (best === undefined || best.selectionScoreBps < CADENCE_SELECTION_THRESHOLD_BPS) {
    return { bestCadence: null, bestScore: null, cadenceMarginBps: 0, ambiguous: false, scores };
  }
  const margin = Math.max(0, best.selectionScoreBps - (second?.selectionScoreBps ?? 0));
  if (margin < CADENCE_SAFETY_MARGIN_BPS) {
    return {
      bestCadence: null,
      bestScore: null,
      cadenceMarginBps: margin,
      ambiguous: true,
      scores
    };
  }
  return {
    bestCadence: best.cadence,
    bestScore: best,
    cadenceMarginBps: Math.min(BASIS_POINTS_SCALE, margin),
    ambiguous: false,
    scores
  };
}

export function computeNextExpectedDate(
  anchorDate: string,
  cadence: DetectedStreamCadence
): string {
  return cadenceSlot(anchorDate, cadence, 1);
}

export function calendarDayDifference(later: string, earlier: string): number {
  const difference = parseDateToEpochDay(later) - parseDateToEpochDay(earlier);
  requireSafeInteger(difference, "calendar day difference");
  return difference;
}

function countSlotsThrough(
  anchorDate: string,
  cadence: DetectedStreamCadence,
  throughDate: string
): number {
  let count = 0;
  for (let slot = 0; slot < 500; slot += 1) {
    const expected = cadenceSlot(anchorDate, cadence, slot);
    if (expected > throughDate) break;
    count += 1;
  }
  return Math.max(1, count);
}

function countRecentMisses(
  lastObservation: string,
  cadence: DetectedStreamCadence,
  asOfDate: string
): number {
  const graceDays = CADENCE_DEFINITIONS[cadence].graceDays;
  let missCount = 0;
  for (let slot = 1; slot <= 3; slot += 1) {
    const expected = cadenceSlot(lastObservation, cadence, slot);
    if (parseDateToEpochDay(expected) + graceDays < parseDateToEpochDay(asOfDate)) {
      missCount += 1;
    }
  }
  return missCount;
}

function intervalDays(sortedDates: readonly string[]): number[] {
  const intervals: number[] = [];
  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = sortedDates[index - 1];
    const current = sortedDates[index];
    if (previous === undefined || current === undefined) continue;
    const interval = parseDateToEpochDay(current) - parseDateToEpochDay(previous);
    if (interval > 0) intervals.push(interval);
  }
  return intervals;
}

function emptyScore(cadence: DetectedStreamCadence): CadenceScoreResult {
  return {
    cadence,
    coverageBps: 0,
    dateStabilityBps: 0,
    missPenaltyBps: BASIS_POINTS_SCALE,
    intervalMedianDays: 0,
    intervalMadDays: 0,
    expectedSlotCount: 0,
    matchedSlotCount: 0,
    recentMissCount: 0,
    selectionScoreBps: 0,
    alignments: []
  };
}

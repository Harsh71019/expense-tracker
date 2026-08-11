import type { NormalizedTransactionText } from "@treasury-ops/shared";

import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";
import { jaccardSimilarityBps } from "../common/transaction-text/similarity.js";
import {
  discreteMedian,
  ratioBasisPoints,
  safeIntegerFromBigInt
} from "../common/statistics/index.js";
import {
  GROUP_AMOUNT_SPLIT_GAP_BPS,
  GROUP_AMOUNT_SPLIT_MIN_MINOR
} from "./recurring-detection.constants.js";

export interface TransactionForGrouping {
  readonly id: string;
  readonly type: "expense" | "income";
  readonly description: string;
  readonly amountMinor: number;
  readonly occurredAt: string;
}

interface NormalizedGroupingTransaction {
  readonly transaction: TransactionForGrouping;
  readonly normalized: NormalizedTransactionText;
}

export interface StreamGroup {
  readonly counterpartyKey: string;
  readonly transactionType: "expense" | "income";
  readonly transactions: readonly TransactionForGrouping[];
  readonly textStabilityBps: number;
  readonly representativeTokens: readonly string[];
  readonly amountClusterIndex: number;
}

export interface StreamGroupingResult {
  readonly groups: readonly StreamGroup[];
  readonly missingCounterpartyCount: number;
}

/** Groups only private normalized text and always partitions income from expense. */
export function groupTransactionsForRecurrence(
  transactions: readonly TransactionForGrouping[]
): StreamGroupingResult {
  const baseGroups = new Map<string, NormalizedGroupingTransaction[]>();
  let missingCounterpartyCount = 0;

  for (const transaction of transactions) {
    const normalized = normalizeTransactionText(transaction.description);
    if (normalized.counterpartyKey === null) {
      missingCounterpartyCount += 1;
      continue;
    }
    const key = `${transaction.type}:${normalized.counterpartyKey}`;
    const existing = baseGroups.get(key) ?? [];
    existing.push({ transaction, normalized });
    baseGroups.set(key, existing);
  }

  const groups: StreamGroup[] = [];
  for (const normalizedGroup of baseGroups.values()) {
    const first = normalizedGroup[0];
    if (first === undefined) continue;
    const clusters = splitClearlyDifferentAmounts(normalizedGroup);
    for (const [amountClusterIndex, cluster] of clusters.entries()) {
      if (cluster.length < 2) continue;
      groups.push({
        counterpartyKey: first.normalized.counterpartyKey ?? "",
        transactionType: first.transaction.type,
        transactions: cluster.map((item) => item.transaction),
        textStabilityBps: computeTextStability(cluster.map((item) => item.normalized)),
        representativeTokens: representativeTokens(cluster.map((item) => item.normalized)),
        amountClusterIndex
      });
    }
  }

  return { groups, missingCounterpartyCount };
}

function splitClearlyDifferentAmounts(
  group: readonly NormalizedGroupingTransaction[]
): readonly (readonly NormalizedGroupingTransaction[])[] {
  const sorted = [...group].sort(
    (left, right) =>
      left.transaction.amountMinor - right.transaction.amountMinor ||
      left.transaction.id.localeCompare(right.transaction.id)
  );
  const clusters: NormalizedGroupingTransaction[][] = [];

  for (const item of sorted) {
    const current = clusters.at(-1);
    if (current === undefined || current.length === 0) {
      clusters.push([item]);
      continue;
    }
    const currentMedian = discreteMedian(
      current.map((candidate) => candidate.transaction.amountMinor)
    );
    const gap = safeIntegerFromBigInt(
      BigInt(item.transaction.amountMinor) - BigInt(currentMedian),
      "recurring grouping amount gap"
    );
    const gapBps = ratioBasisPoints(gap, currentMedian);
    if (gap >= GROUP_AMOUNT_SPLIT_MIN_MINOR && gapBps >= GROUP_AMOUNT_SPLIT_GAP_BPS) {
      clusters.push([item]);
    } else {
      current.push(item);
    }
  }
  return clusters;
}

function computeTextStability(texts: readonly NormalizedTransactionText[]): number {
  if (texts.length < 2) return 0;
  const similarities: number[] = [];
  for (let leftIndex = 0; leftIndex < texts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < texts.length; rightIndex += 1) {
      const left = texts[leftIndex];
      const right = texts[rightIndex];
      if (left === undefined || right === undefined) continue;
      similarities.push(jaccardSimilarityBps(left.tokens, right.tokens));
    }
  }
  return similarities.length === 0 ? 0 : discreteMedian(similarities);
}

function representativeTokens(texts: readonly NormalizedTransactionText[]): readonly string[] {
  const tokenSets = texts.map((text) => new Set(text.tokens));
  const candidates = new Set(texts.flatMap((text) => [...text.tokens]));
  return [...candidates]
    .filter((token) => tokenSets.filter((tokens) => tokens.has(token)).length * 2 >= texts.length)
    .sort();
}

import { createHash } from "node:crypto";

import type { DetectedStreamCadence, DetectedStreamState } from "@treasury-ops/shared";

export function computeStreamLogicalKey(input: {
  readonly userId: string;
  readonly counterpartyKey: string;
  readonly transactionType: "expense" | "income";
  readonly representativeTokens: readonly string[];
  readonly amountClusterIndex: number;
  readonly normalizerVersion: number;
}): string {
  return sha256([
    input.userId,
    input.transactionType,
    input.counterpartyKey,
    input.representativeTokens.join(","),
    String(input.amountClusterIndex),
    `normalizer-v${input.normalizerVersion}`
  ]);
}

export function computeStreamFingerprint(input: {
  readonly logicalKey: string;
  readonly detectorVersion: number;
  readonly cadence: DetectedStreamCadence;
  readonly state: DetectedStreamState;
  readonly medianAmountMinor: number;
  readonly madAmountMinor: number;
  readonly confidenceBps: number;
  readonly memberTransactionIds: readonly string[];
}): string {
  return sha256([
    input.logicalKey,
    `detector-v${input.detectorVersion}`,
    input.cadence,
    input.state,
    String(input.medianAmountMinor),
    String(input.madAmountMinor),
    String(input.confidenceBps),
    [...input.memberTransactionIds].sort().join(",")
  ]);
}

export function sha256(segments: readonly string[]): string {
  return createHash("sha256").update(segments.join("|")).digest("hex");
}

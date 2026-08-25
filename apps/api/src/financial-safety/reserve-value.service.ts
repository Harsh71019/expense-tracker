import { Inject, Injectable } from "@nestjs/common";
import {
  ReserveSourcePageSchema,
  type ListReserveSourcesQuery,
  type ReserveSource,
  type ReserveSourcePage,
  type ReserveSummary
} from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";
import { z } from "zod";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetReserveCandidateReadService } from "../assets/asset-reserve-candidate-read.service.js";
import { decodeCursorPayloadOrNull, encodeCursorPayload } from "../common/pagination/cursor.js";
import {
  evaluateReserveCandidate,
  evaluateReserveSources,
  type ReserveCandidateFact
} from "./reserve-value-evaluator.js";
import { ReserveSourceRepository } from "./reserve-source.repository.js";

export type ReserveValueLogger = Pick<Logger, "log" | "error" | "warn">;

const CursorSchema = z.tuple([z.enum(["account", "asset"]), z.string().uuid()]);

function encodeCursor(sourceKind: "account" | "asset", sourceId: string): string {
  return encodeCursorPayload([sourceKind, sourceId]);
}

function sortSources(a: ReserveSource, b: ReserveSource): number {
  if (a.sourceKind !== b.sourceKind) return a.sourceKind.localeCompare(b.sourceKind);
  return a.sourceId.localeCompare(b.sourceId);
}

/**
 * Read orchestration for reserve sources and the reserve aggregate.
 *
 * Rules:
 * - Loads configuration metadata and current account/asset facts in bounded,
 *   batched reads -- never a per-source query loop.
 * - Delegates all eligibility/aggregate arithmetic to the pure evaluator.
 * - Parses every result through the shared Zod schemas before returning.
 * - Structured log events contain only counts and status keys -- never
 *   financial amounts.
 */
@Injectable()
export class ReserveValueService {
  constructor(
    @Inject(Logger)
    private readonly logger: ReserveValueLogger,
    private readonly reserveSources: ReserveSourceRepository,
    private readonly accounts: AccountRepository,
    private readonly assetCandidates: AssetReserveCandidateReadService
  ) {}

  async listSources(userId: string, query: ListReserveSourcesQuery): Promise<ReserveSourcePage> {
    const asOf = new Date();
    const candidates = await this.buildCandidates(userId, asOf);
    let sources = candidates
      .map((candidate) => evaluateReserveCandidate(candidate, asOf))
      .sort(sortSources);

    if (query.sourceKind !== undefined) {
      sources = sources.filter((source) => source.sourceKind === query.sourceKind);
    }
    if (query.configured !== undefined) {
      sources = sources.filter((source) => (source.configuration !== null) === query.configured);
    }
    if (query.eligible !== undefined) {
      sources = sources.filter((source) => (source.eligibility === "eligible") === query.eligible);
    }

    const startIndex = query.cursor !== undefined ? this.findCursorIndex(sources, query.cursor) : 0;
    const page = sources.slice(startIndex, startIndex + query.limit);
    const hasMore = startIndex + query.limit < sources.length;
    const lastItem = page.at(-1);

    return ReserveSourcePageSchema.parse({
      items: page,
      pageInfo: {
        nextCursor:
          hasMore && lastItem ? encodeCursor(lastItem.sourceKind, lastItem.sourceId) : null,
        hasMore,
        limit: query.limit
      }
    });
  }

  async getSummary(userId: string, asOf: Date = new Date()): Promise<ReserveSummary> {
    const startTime = performance.now();
    const candidates = await this.buildCandidates(userId, asOf);
    const { summary } = evaluateReserveSources({ candidates, asOf });
    const durationMs = Math.round(performance.now() - startTime);

    this.logger.log(
      {
        event: "financial_safety.reserves_evaluated",
        userId,
        configuredSourceCount: summary.configuredSourceCount,
        currentlyEligibleSourceCount: summary.currentlyEligibleSourceCount,
        missingValueSourceCount: summary.missingValueSourceCount,
        staleSourceCount: summary.staleSourceCount,
        excludedSourceCount: summary.excludedSourceCount,
        limitations: summary.limitations,
        durationMs
      },
      "Evaluated emergency reserve sources"
    );

    return summary;
  }

  private findCursorIndex(sources: readonly ReserveSource[], cursor: string): number {
    const decoded = decodeCursorPayloadOrNull(cursor, CursorSchema);
    if (decoded === null) return 0;
    const [sourceKind, sourceId] = decoded;
    const index = sources.findIndex(
      (source) => source.sourceKind === sourceKind && source.sourceId === sourceId
    );
    return index === -1 ? 0 : index + 1;
  }

  private async buildCandidates(userId: string, asOf: Date): Promise<ReserveCandidateFact[]> {
    const [accounts, assets, configurations] = await Promise.all([
      this.accounts.listAll(userId),
      this.assetCandidates.listCandidates(userId, asOf),
      this.reserveSources.listActiveByUser(userId)
    ]);

    const accountFacts: ReserveCandidateFact[] = accounts.map((account) => ({
      sourceKind: "account",
      sourceId: account.id,
      displayName: account.name,
      sourceType: account.type,
      isUnavailable: account.isArchived,
      currentValueMinor: account.balanceMinor,
      valuedAt: null,
      freshnessThresholdDays: null,
      lastUpdatedAt: account.updatedAt,
      configuration: configurations.get(`account:${account.id}`)?.configuration ?? null
    }));

    const assetFacts: ReserveCandidateFact[] = assets.map((asset) => ({
      sourceKind: "asset",
      sourceId: asset.assetId,
      displayName: asset.name,
      sourceType: asset.kind,
      isUnavailable: asset.isClosed,
      currentValueMinor: asset.currentValueMinor,
      valuedAt: asset.valuedAt,
      freshnessThresholdDays: asset.freshnessThresholdDays,
      lastUpdatedAt: asset.lastUpdatedAt,
      configuration: configurations.get(`asset:${asset.assetId}`)?.configuration ?? null
    }));

    return [...accountFacts, ...assetFacts];
  }
}

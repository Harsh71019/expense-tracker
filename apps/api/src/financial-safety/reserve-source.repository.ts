import { Inject, Injectable } from "@nestjs/common";
import {
  ReserveSourceConfigurationSchema,
  type ReserveSourceConfiguration,
  type ReserveSourceKind,
  type UpdateReserveSource
} from "@treasury-ops/shared";
import { and, eq, isNull } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { financialReserveSources } from "../common/db/schema/index.js";

export interface ReserveSourceRow {
  readonly id: string;
  readonly sourceKind: ReserveSourceKind;
  readonly sourceId: string;
  readonly configuration: ReserveSourceConfiguration;
}

function toConfiguration(row: {
  liquidityTier: string;
  isIncluded: boolean;
  eligibleCapMinor: number | null;
  effectiveFrom: Date;
  createdAt: Date;
}): ReserveSourceConfiguration {
  return ReserveSourceConfigurationSchema.parse({
    liquidityTier: row.liquidityTier,
    isIncluded: row.isIncluded,
    eligibleCapMinor: row.eligibleCapMinor,
    effectiveFrom: row.effectiveFrom,
    configuredAt: row.createdAt
  });
}

/**
 * Tenant-scoped repository for reserve source classification metadata only.
 * Never touches account balances, asset valuations, or ledger tables.
 */
@Injectable()
export class ReserveSourceRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /** Every currently active classification for a user, keyed by `sourceKind:sourceId`. */
  async listActiveByUser(userId: string): Promise<ReadonlyMap<string, ReserveSourceRow>> {
    const rows = await this.db
      .select()
      .from(financialReserveSources)
      .where(
        and(
          eq(financialReserveSources.userId, userId),
          isNull(financialReserveSources.supersededAt)
        )
      );

    const result = new Map<string, ReserveSourceRow>();
    for (const row of rows) {
      result.set(`${row.sourceKind}:${row.sourceId}`, {
        id: row.id,
        sourceKind: row.sourceKind,
        sourceId: row.sourceId,
        configuration: toConfiguration(row)
      });
    }
    return result;
  }

  async findActive(
    userId: string,
    sourceKind: ReserveSourceKind,
    sourceId: string,
    tx?: DbTx
  ): Promise<ReserveSourceRow | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(financialReserveSources)
      .where(
        and(
          eq(financialReserveSources.userId, userId),
          eq(financialReserveSources.sourceKind, sourceKind),
          eq(financialReserveSources.sourceId, sourceId),
          isNull(financialReserveSources.supersededAt)
        )
      );
    if (row === undefined) return null;
    return {
      id: row.id,
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      configuration: toConfiguration(row)
    };
  }

  /** Row-locking read used inside the mutation transaction to serialize concurrent classifications of the same source. */
  async findActiveForUpdate(
    userId: string,
    sourceKind: ReserveSourceKind,
    sourceId: string,
    tx: DbTx
  ): Promise<ReserveSourceRow | null> {
    const [row] = await tx
      .select()
      .from(financialReserveSources)
      .where(
        and(
          eq(financialReserveSources.userId, userId),
          eq(financialReserveSources.sourceKind, sourceKind),
          eq(financialReserveSources.sourceId, sourceId),
          isNull(financialReserveSources.supersededAt)
        )
      )
      .for("update");
    if (row === undefined) return null;
    return {
      id: row.id,
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      configuration: toConfiguration(row)
    };
  }

  async supersede(userId: string, id: string, supersededAt: Date, tx: DbTx): Promise<boolean> {
    const rows = await tx
      .update(financialReserveSources)
      .set({ supersededAt })
      .where(
        and(
          eq(financialReserveSources.userId, userId),
          eq(financialReserveSources.id, id),
          isNull(financialReserveSources.supersededAt)
        )
      )
      .returning({ id: financialReserveSources.id });
    return rows.length === 1;
  }

  async create(
    userId: string,
    sourceKind: ReserveSourceKind,
    sourceId: string,
    input: UpdateReserveSource,
    effectiveFrom: Date,
    revisionOf: string | null,
    tx: DbTx
  ): Promise<ReserveSourceRow> {
    const now = new Date();
    const [row] = await tx
      .insert(financialReserveSources)
      .values({
        userId,
        sourceKind,
        sourceId,
        liquidityTier: input.liquidityTier,
        isIncluded: input.isIncluded,
        eligibleCapMinor: input.eligibleCapMinor ?? null,
        effectiveFrom,
        revisionOf,
        createdAt: now
      })
      .returning();

    if (row === undefined) {
      throw new Error("Failed to create reserve source classification.");
    }

    return {
      id: row.id,
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      configuration: toConfiguration(row)
    };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import {
  ProtectionSnapshotSchema,
  type ProtectionSnapshot,
  type UpsertProtection
} from "@treasury-ops/shared";
import { and, asc, desc, eq, gt, lte } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { protectionSnapshots } from "../common/db/schema/index.js";

export type NewProtectionSnapshot = Omit<UpsertProtection, "effectiveFrom"> &
  Readonly<{ effectiveFrom: Date }>;

/**
 * The only layer that touches Drizzle for protection facts. Every method takes
 * `userId` first and filters by it, and none of them updates or deletes a
 * snapshot — protection history is append-only, exactly like salary history.
 */
@Injectable()
export class ProtectionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async createSnapshot(
    userId: string,
    input: NewProtectionSnapshot,
    tx: DbTx
  ): Promise<ProtectionSnapshot> {
    const [row] = await tx
      .insert(protectionSnapshots)
      .values({
        userId,
        effectiveFrom: input.effectiveFrom,
        termCoverStatus: input.termCoverStatus,
        independentTermCoverMinor: input.independentTermCoverMinor,
        employerTermCoverMinor: input.employerTermCoverMinor,
        independentTermExpiresOn: input.independentTermExpiresOn,
        termNotApplicableReason: input.termNotApplicableReason,
        healthCoverStatus: input.healthCoverStatus,
        independentHealthBaseCoverMinor: input.independentHealthBaseCoverMinor,
        independentHealthSuperTopUpMinor: input.independentHealthSuperTopUpMinor,
        employerHealthCoverMinor: input.employerHealthCoverMinor,
        independentHealthExpiresOn: input.independentHealthExpiresOn,
        dependantCount: input.dependantCount,
        createdAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Protection snapshot insert did not return a row.");
    return ProtectionSnapshotSchema.parse(row);
  }

  /** Newest snapshot with `effectiveFrom <= asOf`, tie-broken by descending id. */
  async findEffectiveSnapshot(
    userId: string,
    asOf: Date,
    tx?: DbTx
  ): Promise<ProtectionSnapshot | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(protectionSnapshots)
      .where(
        and(eq(protectionSnapshots.userId, userId), lte(protectionSnapshots.effectiveFrom, asOf))
      )
      .orderBy(desc(protectionSnapshots.effectiveFrom), desc(protectionSnapshots.id))
      .limit(1);
    return row === undefined ? null : ProtectionSnapshotSchema.parse(row);
  }

  /** Earliest snapshot that has not taken effect yet, if any. */
  async findUpcomingSnapshot(
    userId: string,
    asOf: Date,
    tx?: DbTx
  ): Promise<ProtectionSnapshot | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(protectionSnapshots)
      .where(
        and(eq(protectionSnapshots.userId, userId), gt(protectionSnapshots.effectiveFrom, asOf))
      )
      .orderBy(asc(protectionSnapshots.effectiveFrom), asc(protectionSnapshots.id))
      .limit(1);
    return row === undefined ? null : ProtectionSnapshotSchema.parse(row);
  }
}

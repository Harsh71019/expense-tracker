import { Inject, Injectable } from "@nestjs/common";
import {
  FinancialProfileSchema,
  SalaryVersionSchema,
  type FinancialProfile,
  type FinancialProfileUpdate,
  type SalarySource,
  type SalaryVersion
} from "@treasury-ops/shared";
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { financialProfiles, salaryVersions } from "../common/db/schema/index.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";

const CursorPayloadSchema = z.object({
  effectiveFrom: z.string().datetime(),
  id: z.string().uuid()
});

export type NewSalaryVersion = Readonly<{
  netMonthlySalaryMinor: number;
  annualCtcMinor: number | null;
  effectiveFrom: Date;
  source: SalarySource;
}>;

export type SalaryVersionPageResult = Readonly<{
  items: SalaryVersion[];
  hasMore: boolean;
  nextCursor: string | null;
}>;

/**
 * The only layer that touches Drizzle for salary and work facts. Every method
 * takes `userId` first and filters by it — there is no cross-tenant read path
 * here, and no method updates or deletes a salary version.
 */
@Injectable()
export class FinancialProfileRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findProfile(userId: string, tx?: DbTx): Promise<FinancialProfile | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(financialProfiles)
      .where(eq(financialProfiles.userId, userId));
    return row === undefined ? null : FinancialProfileSchema.parse(row);
  }

  /**
   * The profile holds four preferences and the PATCH body carries all of
   * them, so an upsert is a full replace of that set — never a partial merge
   * that could leave a stale credit day behind after the user cleared it.
   */
  async upsertProfile(
    userId: string,
    input: FinancialProfileUpdate,
    tx: DbTx
  ): Promise<FinancialProfile> {
    const now = new Date();
    const [row] = await tx
      .insert(financialProfiles)
      .values({
        userId,
        monthlyWorkMinutes: input.monthlyWorkMinutes,
        salaryCreditDay: input.salaryCreditDay,
        expectedAnnualIncrementBps: input.expectedAnnualIncrementBps,
        incomeStability: input.incomeStability,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: financialProfiles.userId,
        set: {
          monthlyWorkMinutes: input.monthlyWorkMinutes,
          salaryCreditDay: input.salaryCreditDay,
          expectedAnnualIncrementBps: input.expectedAnnualIncrementBps,
          incomeStability: input.incomeStability,
          updatedAt: now
        }
      })
      .returning();
    return FinancialProfileSchema.parse(row);
  }

  async createSalaryVersion(
    userId: string,
    input: NewSalaryVersion,
    tx: DbTx
  ): Promise<SalaryVersion> {
    const [row] = await tx
      .insert(salaryVersions)
      .values({
        userId,
        netMonthlySalaryMinor: input.netMonthlySalaryMinor,
        annualCtcMinor: input.annualCtcMinor,
        effectiveFrom: input.effectiveFrom,
        source: input.source,
        createdAt: new Date()
      })
      .returning();
    return SalaryVersionSchema.parse(row);
  }

  /** Newest version with `effectiveFrom <= asOf`, tie-broken by descending id. */
  async findEffectiveSalaryVersion(
    userId: string,
    asOf: Date,
    tx?: DbTx
  ): Promise<SalaryVersion | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(salaryVersions)
      .where(and(eq(salaryVersions.userId, userId), lte(salaryVersions.effectiveFrom, asOf)))
      .orderBy(desc(salaryVersions.effectiveFrom), desc(salaryVersions.id))
      .limit(1);
    return row === undefined ? null : SalaryVersionSchema.parse(row);
  }

  /** Earliest version that has not taken effect yet, if any. */
  async findUpcomingSalaryVersion(
    userId: string,
    asOf: Date,
    tx?: DbTx
  ): Promise<SalaryVersion | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(salaryVersions)
      .where(and(eq(salaryVersions.userId, userId), gt(salaryVersions.effectiveFrom, asOf)))
      .orderBy(asc(salaryVersions.effectiveFrom), asc(salaryVersions.id))
      .limit(1);
    return row === undefined ? null : SalaryVersionSchema.parse(row);
  }

  /**
   * One page of history, newest effective date first. Cursor pagination on
   * `(effective_from, id)` — never offset — so an appended version cannot
   * shift a page the client already read.
   */
  async listSalaryVersions(
    userId: string,
    options: Readonly<{ cursor?: string | undefined; limit: number }>,
    tx?: DbTx
  ): Promise<SalaryVersionPageResult> {
    const executor = tx ?? this.db;
    const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
    const conditions = [eq(salaryVersions.userId, userId)];
    if (cursor !== null) {
      conditions.push(
        sql`(${salaryVersions.effectiveFrom}, ${salaryVersions.id}) < (${cursor.effectiveFrom}, ${cursor.id})`
      );
    }

    const rows = await executor
      .select()
      .from(salaryVersions)
      .where(and(...conditions))
      .orderBy(desc(salaryVersions.effectiveFrom), desc(salaryVersions.id))
      .limit(options.limit + 1);

    const page = rows.slice(0, options.limit).map((row) => SalaryVersionSchema.parse(row));
    const hasMore = rows.length > options.limit;
    const last = page.at(-1);
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.effectiveFrom, last.id) : null
    };
  }
}

export function encodeCursor(effectiveFrom: Date, id: string): string {
  return encodeCursorPayload({ effectiveFrom: effectiveFrom.toISOString(), id });
}

function decodeCursor(cursor: string): { effectiveFrom: Date; id: string } {
  const payload = decodeCursorPayload(cursor, CursorPayloadSchema);
  return { effectiveFrom: new Date(payload.effectiveFrom), id: payload.id };
}

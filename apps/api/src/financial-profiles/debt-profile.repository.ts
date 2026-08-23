import { Inject, Injectable } from "@nestjs/common";
import {
  HIGH_COST_DEBT_ANNUAL_RATE_BPS,
  type CreateDeclaredDebt,
  type DeclaredDebtId,
  type DeclaredDebtKind,
  type DeclaredDebtStatus
} from "@treasury-ops/shared";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { declaredDebts } from "../common/db/schema/index.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";
import { StoredDeclaredDebtSchema, type StoredDeclaredDebt } from "./debt-policy.js";

const CursorPayloadSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid()
});

export type DeclaredDebtPatch = Readonly<{
  name?: string;
  kind?: DeclaredDebtKind;
  declaredOutstandingMinor?: number;
  annualRateBps?: number;
  minimumPaymentMinor?: number | null;
  status?: DeclaredDebtStatus;
  resolvedAt?: Date | null;
}>;

export type DeclaredDebtPageResult = Readonly<{
  items: StoredDeclaredDebt[];
  hasMore: boolean;
  nextCursor: string | null;
}>;

/**
 * The only layer that touches Drizzle for declared debts. Every method takes
 * `userId` first and filters by it, so a debt id belonging to another tenant is
 * indistinguishable from one that does not exist.
 *
 * There is no delete: resolving a debt is a status change, and the row stays.
 */
@Injectable()
export class DeclaredDebtRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreateDeclaredDebt, tx: DbTx): Promise<StoredDeclaredDebt> {
    const now = new Date();
    const [row] = await tx
      .insert(declaredDebts)
      .values({
        userId,
        name: input.name,
        kind: input.kind,
        declaredOutstandingMinor: input.declaredOutstandingMinor,
        annualRateBps: input.annualRateBps,
        minimumPaymentMinor: input.minimumPaymentMinor,
        linkedAssetId: input.linkedAssetId,
        status: "active",
        createdAt: now,
        updatedAt: now,
        resolvedAt: null
      })
      .returning();
    if (row === undefined) throw new Error("Declared debt insert did not return a row.");
    return StoredDeclaredDebtSchema.parse(row);
  }

  async findById(
    userId: string,
    debtId: DeclaredDebtId,
    tx?: DbTx
  ): Promise<StoredDeclaredDebt | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(declaredDebts)
      .where(and(eq(declaredDebts.id, debtId), eq(declaredDebts.userId, userId)));
    return row === undefined ? null : StoredDeclaredDebtSchema.parse(row);
  }

  /**
   * Updates debt *metadata* only. The `status = 'active'` predicate is what
   * makes resolution terminal at the database level, and no column touched here
   * belongs to an asset, a valuation, or the ledger.
   */
  async updateActive(
    userId: string,
    debtId: DeclaredDebtId,
    patch: DeclaredDebtPatch,
    tx: DbTx
  ): Promise<StoredDeclaredDebt | null> {
    const [row] = await tx
      .update(declaredDebts)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(declaredDebts.id, debtId),
          eq(declaredDebts.userId, userId),
          eq(declaredDebts.status, "active")
        )
      )
      .returning();
    return row === undefined ? null : StoredDeclaredDebtSchema.parse(row);
  }

  /**
   * One page, newest first. Cursor pagination on `(created_at, id)` — never
   * offset — so declaring a new debt cannot shift a page the client already
   * read.
   */
  async list(
    userId: string,
    options: Readonly<{
      cursor?: string | undefined;
      limit: number;
      status: DeclaredDebtStatus;
    }>,
    tx?: DbTx
  ): Promise<DeclaredDebtPageResult> {
    const executor = tx ?? this.db;
    const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
    const conditions = [eq(declaredDebts.userId, userId), eq(declaredDebts.status, options.status)];
    if (cursor !== null) {
      conditions.push(
        sql`(${declaredDebts.createdAt}, ${declaredDebts.id}) < (${cursor.createdAt}, ${cursor.id})`
      );
    }

    const rows = await executor
      .select()
      .from(declaredDebts)
      .where(and(...conditions))
      .orderBy(desc(declaredDebts.createdAt), desc(declaredDebts.id))
      .limit(options.limit + 1);

    const page = rows.slice(0, options.limit).map((row) => StoredDeclaredDebtSchema.parse(row));
    const hasMore = rows.length > options.limit;
    const last = page.at(-1);
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last !== undefined ? encodeDebtCursor(last.createdAt, last.id) : null
    };
  }

  /** How many debts in this status carry a rate above the high-cost threshold. */
  async countHighCost(userId: string, status: DeclaredDebtStatus): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(declaredDebts)
      .where(
        and(
          eq(declaredDebts.userId, userId),
          eq(declaredDebts.status, status),
          gt(declaredDebts.annualRateBps, HIGH_COST_DEBT_ANNUAL_RATE_BPS)
        )
      );
    return row?.total ?? 0;
  }
}

function encodeDebtCursor(createdAt: Date, id: string): string {
  return encodeCursorPayload({ createdAt: createdAt.toISOString(), id });
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const payload = decodeCursorPayload(cursor, CursorPayloadSchema);
  return { createdAt: new Date(payload.createdAt), id: payload.id };
}

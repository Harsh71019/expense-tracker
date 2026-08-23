import { Inject, Injectable } from "@nestjs/common";
import {
  SafetyBufferPreferenceSchema,
  type CreateSafetyBufferPreference,
  type SafetyBufferPreference,
  type SafetyBufferVersionPage
} from "@treasury-ops/shared";
import { and, desc, eq, lte, lt, or } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { decodeCursorPayloadOrNull, encodeCursorPayload } from "../common/pagination/cursor.js";
import { goals, safetyBufferPreferences } from "../common/db/schema/index.js";

const CursorDataSchema = z.tuple([z.number().int(), z.number().int()]); // [effectiveFromEpoch, version]

function encodeCursor(effectiveFrom: Date, version: number): string {
  return encodeCursorPayload([effectiveFrom.getTime(), version]);
}

function decodeCursor(cursor: string): { effectiveFrom: Date; version: number } | null {
  const parsed = decodeCursorPayloadOrNull(cursor, CursorDataSchema);
  if (parsed === null) return null;
  return {
    effectiveFrom: new Date(parsed[0]),
    version: parsed[1]
  };
}

@Injectable()
export class SafetyBufferRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findEffective(
    userId: string,
    asOf: Date,
    tx?: DbTx
  ): Promise<SafetyBufferPreference | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(safetyBufferPreferences)
      .where(
        and(
          eq(safetyBufferPreferences.userId, userId),
          lte(safetyBufferPreferences.effectiveFrom, asOf)
        )
      )
      .orderBy(desc(safetyBufferPreferences.effectiveFrom), desc(safetyBufferPreferences.version))
      .limit(1);

    return row === undefined ? null : SafetyBufferPreferenceSchema.parse(row);
  }

  async findLatestVersion(userId: string, tx?: DbTx): Promise<SafetyBufferPreference | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(safetyBufferPreferences)
      .where(eq(safetyBufferPreferences.userId, userId))
      .orderBy(desc(safetyBufferPreferences.version))
      .limit(1);

    return row === undefined ? null : SafetyBufferPreferenceSchema.parse(row);
  }

  async findGoal(
    userId: string,
    goalId: string,
    tx?: DbTx
  ): Promise<{ id: string; targetMinor: number; name: string } | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({
        id: goals.id,
        targetMinor: goals.targetMinor,
        name: goals.name
      })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));

    return row ?? null;
  }

  async createVersion(
    userId: string,
    input: CreateSafetyBufferPreference,
    version: number,
    effectiveFrom: Date,
    tx?: DbTx
  ): Promise<SafetyBufferPreference> {
    const executor = tx ?? this.db;
    const now = new Date();
    const [row] = await executor
      .insert(safetyBufferPreferences)
      .values({
        userId,
        version,
        mode: input.mode,
        amountMinor: input.mode === "fixed_amount" ? (input.amountMinor ?? 0) : null,
        months: input.mode === "essential_months" ? (input.months ?? 1) : null,
        emergencyFundGoalId:
          input.mode === "emergency_fund_goal" ? (input.emergencyFundGoalId ?? null) : null,
        effectiveFrom,
        createdAt: now
      })
      .returning();

    return SafetyBufferPreferenceSchema.parse(row);
  }

  async listVersions(
    userId: string,
    cursor?: string,
    limit = 50
  ): Promise<SafetyBufferVersionPage> {
    const conditions = [eq(safetyBufferPreferences.userId, userId)];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const cursorCondition = or(
          lt(safetyBufferPreferences.effectiveFrom, decoded.effectiveFrom),
          and(
            eq(safetyBufferPreferences.effectiveFrom, decoded.effectiveFrom),
            lt(safetyBufferPreferences.version, decoded.version)
          )
        );
        if (cursorCondition) conditions.push(cursorCondition);
      }
    }

    const rows = await this.db
      .select()
      .from(safetyBufferPreferences)
      .where(and(...conditions))
      .orderBy(desc(safetyBufferPreferences.effectiveFrom), desc(safetyBufferPreferences.version))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const parsedItems = items.map((r) => SafetyBufferPreferenceSchema.parse(r));
    const lastItem = parsedItems.at(-1);

    return {
      items: parsedItems,
      pageInfo: {
        nextCursor:
          hasMore && lastItem ? encodeCursor(lastItem.effectiveFrom, lastItem.version) : null,
        hasMore,
        limit
      }
    };
  }
}

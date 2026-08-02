import { Inject, Injectable } from "@nestjs/common";
import { CategoryIdSchema, TransactionIdSchema, TransactionTypeSchema } from "@treasury-ops/shared";
import type { TransactionType } from "@treasury-ops/shared";
import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { transactions } from "../common/db/schema/index.js";
import {
  CATEGORY_SUGGESTION_HISTORY_LIMIT,
  CATEGORY_SUGGESTION_RESOURCE_CONTRACT
} from "./category-suggestion-ranking.js";
import type { CategorySuggestionHistoryItem } from "./category-suggestion-ranking.js";

const CategorySuggestionHistoryRowSchema = z.object({
  id: TransactionIdSchema,
  categoryId: CategoryIdSchema,
  description: z.string(),
  occurredAt: z.coerce.date(),
  type: TransactionTypeSchema
});

@Injectable()
export class CategorySuggestionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findHistory(
    userId: string,
    type: TransactionType,
    occurredBefore: Date,
    limit: number = CATEGORY_SUGGESTION_HISTORY_LIMIT
  ): Promise<CategorySuggestionHistoryItem[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > CATEGORY_SUGGESTION_HISTORY_LIMIT) {
      throw new RangeError(
        `Category suggestion history limit must be between 1 and ${CATEGORY_SUGGESTION_HISTORY_LIMIT}.`
      );
    }
    if (Number.isNaN(occurredBefore.getTime())) {
      throw new RangeError("Category suggestion history boundary must be a valid date.");
    }
    const occurredAfter = new Date(
      occurredBefore.getTime() -
        CATEGORY_SUGGESTION_RESOURCE_CONTRACT.lookbackDays * 24 * 60 * 60 * 1_000
    );

    const rows = await this.db
      .select({
        id: transactions.id,
        categoryId: transactions.categoryId,
        description: transactions.description,
        occurredAt: transactions.occurredAt,
        type: transactions.type
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, type),
          eq(transactions.status, "posted"),
          isNotNull(transactions.categoryId),
          isNull(transactions.reversalOf),
          isNull(transactions.reversedBy),
          gte(transactions.occurredAt, occurredAfter),
          lt(transactions.occurredAt, occurredBefore)
        )
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(limit);
    return rows.map((row) => CategorySuggestionHistoryRowSchema.parse(row));
  }
}

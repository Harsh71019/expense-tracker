import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { MonthlyRollupSchema, type Month, type MonthlyRollup } from "@vyaya/shared";
import type { Connection } from "mongoose";

const TRANSACTIONS_COLLECTION = "transactions";
const MONTHLY_ROLLUPS_COLLECTION = "monthly_rollups";
const IST_TIME_ZONE = "Asia/Kolkata";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type FacetResult = Readonly<{
  byCategory: readonly {
    _id: unknown;
    spentMinor: number;
    incomeMinor: number;
    txnCount: number;
  }[];
  byAccount: readonly { _id: unknown; netMinor: number }[];
  totals: readonly { totalExpenseMinor: number; totalIncomeMinor: number }[];
}>;

@Injectable()
export class MonthlyRollupRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * BACKEND.md §6 rollups.refresh: recomputed from `transactions`, never
   * incrementally maintained — a full aggregation pass per user/month is
   * cheap at personal-finance scale and immune to drift. `status: "posted"`
   * mirrors ExportService's filter: a reversed original (status "reversed")
   * and its reversal (status "reversal", never "posted") are both excluded,
   * which nets to the same zero contribution as including both would.
   * Month bucketing uses Mongo's own `timezone`-aware $dateToString rather
   * than a JS-computed UTC range, since manual transactions carry a real
   * time-of-day and the IST month a timestamp falls into can differ from its
   * UTC month.
   */
  async recompute(userId: string, month: Month): Promise<MonthlyRollup> {
    const { roughStart, roughEnd } = roughMonthBounds(month);
    const [facetResult] = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .aggregate<FacetResult>([
        {
          $match: {
            userId,
            status: "posted",
            occurredAt: { $gte: roughStart, $lt: roughEnd }
          }
        },
        {
          $addFields: {
            istMonth: {
              $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: IST_TIME_ZONE }
            }
          }
        },
        { $match: { istMonth: month } },
        {
          $facet: {
            byCategory: [
              {
                $group: {
                  _id: "$categoryId",
                  spentMinor: {
                    $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amountMinor", 0] }
                  },
                  incomeMinor: {
                    $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amountMinor", 0] }
                  },
                  txnCount: { $sum: 1 }
                }
              }
            ],
            byAccount: [
              {
                $group: {
                  _id: "$accountId",
                  netMinor: {
                    $sum: {
                      $cond: [
                        { $eq: ["$type", "income"] },
                        "$amountMinor",
                        { $multiply: ["$amountMinor", -1] }
                      ]
                    }
                  }
                }
              }
            ],
            totals: [
              {
                $group: {
                  _id: null,
                  totalExpenseMinor: {
                    $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amountMinor", 0] }
                  },
                  totalIncomeMinor: {
                    $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amountMinor", 0] }
                  }
                }
              }
            ]
          }
        }
      ])
      .toArray();

    const totals = facetResult?.totals[0];
    const document = {
      userId,
      month,
      byCategory: (facetResult?.byCategory ?? []).map((entry) => ({
        // categories is Postgres-backed (Task 10) -- transactions.categoryId is now a
        // plain string (the referenced uuid), not a Mongo ObjectId, so the group key
        // needs no ObjectId conversion, unlike byAccount's entry._id below.
        ...(entry._id === null ? {} : { categoryId: categoryIdString(entry._id) }),
        spentMinor: entry.spentMinor,
        incomeMinor: entry.incomeMinor,
        txnCount: entry.txnCount
      })),
      byAccount: (facetResult?.byAccount ?? []).map((entry) => ({
        accountId: objectIdString(entry._id),
        netMinor: entry.netMinor
      })),
      totalExpenseMinor: totals?.totalExpenseMinor ?? 0,
      totalIncomeMinor: totals?.totalIncomeMinor ?? 0,
      computedAt: new Date()
    };

    await this.database()
      .collection(MONTHLY_ROLLUPS_COLLECTION)
      .updateOne({ userId, month }, { $set: document }, { upsert: true });

    return MonthlyRollupSchema.parse(document);
  }

  async findByMonth(userId: string, month: Month): Promise<MonthlyRollup | null> {
    const document = await this.database()
      .collection(MONTHLY_ROLLUPS_COLLECTION)
      .findOne({ userId, month });
    if (document === null) return null;
    return MonthlyRollupSchema.parse(document);
  }

  /** The refresh cron's worklist — every user who has ever posted a transaction. */
  async distinctUserIds(): Promise<string[]> {
    const userIds = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .distinct("userId", { status: "posted" });
    return userIds.filter((userId): userId is string => typeof userId === "string");
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }
    return database;
  }
}

function roughMonthBounds(month: Month): { roughStart: Date; roughEnd: Date } {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  return {
    roughStart: new Date(Date.UTC(year, monthIndex, 1) - ONE_DAY_MS),
    roughEnd: new Date(Date.UTC(year, monthIndex + 1, 1) + ONE_DAY_MS)
  };
}

function categoryIdString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Grouped categoryId is not a string.");
  }
  return value;
}

function objectIdString(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toString" in value)) {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  const stringify = value.toString;
  if (typeof stringify !== "function") {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  return stringify.call(value);
}

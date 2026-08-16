import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  CashflowForecastInputWatermarkSchema,
  CashflowForecastSnapshotSchema,
  type CashflowForecastSnapshot
} from "@treasury-ops/shared";

import { DATABASE_CONNECTION, type DrizzleDb } from "../../common/db/db.module.js";
import { withTxn } from "../../common/db/db-txn.js";
import {
  accounts,
  cashflowForecastSnapshots,
  creditCardBills,
  detectedRecurringStreamMembers,
  detectedRecurringStreams,
  transactions
} from "../../common/db/schema/index.js";
import { CASHFLOW_FORECAST_RESOURCE_CONTRACT } from "./forecasting.constants.js";

export interface ForecastTransaction {
  readonly id: string;
  readonly type: "expense" | "income";
  readonly amountMinor: number;
  readonly occurredAt: Date;
  readonly accountType: "bank" | "credit_card" | "cash" | "wallet" | "investment";
  readonly transferGroupId: string | null;
  readonly billId: string | null;
}
export interface ForecastKnownStream {
  readonly transactionType: "expense" | "income";
  readonly cadence: "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annual";
  readonly amountMinor: number;
  readonly nextExpectedDate: string | null;
}
export interface ForecastInputs {
  readonly transactions: readonly ForecastTransaction[];
  readonly recurringTransactionIds: ReadonlySet<string>;
  readonly knownStreams: readonly ForecastKnownStream[];
  readonly liquidBalanceMinor: number;
  readonly billsDue: readonly {
    readonly id: string;
    readonly dueDate: Date;
    readonly amountDueMinor: number;
    readonly paidMinor: number;
  }[];
  readonly watermark: ReturnType<typeof CashflowForecastInputWatermarkSchema.parse>;
  readonly rowBudgetHit: boolean;
}

@Injectable()
export class ForecastingRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findInputs(userId: string, asOf: Date): Promise<ForecastInputs> {
    const start = new Date(
      asOf.getTime() - CASHFLOW_FORECAST_RESOURCE_CONTRACT.lookbackDays * 86_400_000
    );
    const rows = await this.db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        occurredAt: transactions.occurredAt,
        accountType: accounts.type,
        transferGroupId: transactions.transferGroupId,
        billId: transactions.billId,
        updatedAt: transactions.updatedAt
      })
      .from(transactions)
      .innerJoin(
        accounts,
        and(eq(accounts.id, transactions.accountId), eq(accounts.userId, userId))
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          gte(transactions.occurredAt, start),
          lte(transactions.occurredAt, asOf),
          lte(transactions.createdAt, asOf),
          lte(transactions.updatedAt, asOf)
        )
      )
      .orderBy(asc(transactions.occurredAt), asc(transactions.id))
      .limit(CASHFLOW_FORECAST_RESOURCE_CONTRACT.maxRows + 1);
    const bounded = rows.slice(0, CASHFLOW_FORECAST_RESOURCE_CONTRACT.maxRows);
    const ids = bounded.map((row) => row.id);
    const members =
      ids.length === 0
        ? []
        : await this.db
            .select({ transactionId: detectedRecurringStreamMembers.transactionId })
            .from(detectedRecurringStreamMembers)
            .innerJoin(
              detectedRecurringStreams,
              and(
                eq(detectedRecurringStreams.id, detectedRecurringStreamMembers.streamId),
                eq(detectedRecurringStreams.userId, userId)
              )
            )
            .where(
              and(
                eq(detectedRecurringStreamMembers.userId, userId),
                inArray(detectedRecurringStreamMembers.transactionId, ids),
                eq(detectedRecurringStreams.state, "mature")
              )
            );
    const streams = await this.db
      .select({
        transactionType: detectedRecurringStreams.transactionType,
        cadence: detectedRecurringStreams.cadence,
        amountMinor: detectedRecurringStreams.medianAmountMinor,
        nextExpectedDate: detectedRecurringStreams.nextExpectedDate
      })
      .from(detectedRecurringStreams)
      .where(
        and(
          eq(detectedRecurringStreams.userId, userId),
          eq(detectedRecurringStreams.state, "mature"),
          lte(detectedRecurringStreams.computedAt, asOf)
        )
      );
    const liquid = await this.db
      .select({ balanceMinor: accounts.balanceMinor })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.isArchived, false),
          notInArray(accounts.type, ["credit_card", "investment"])
        )
      );
    const bills = await this.db
      .select({
        id: creditCardBills.id,
        dueDate: creditCardBills.dueDate,
        amountDueMinor: creditCardBills.amountDueMinor
      })
      .from(creditCardBills)
      .where(
        and(
          eq(creditCardBills.userId, userId),
          gte(creditCardBills.dueDate, asOf),
          lte(creditCardBills.dueDate, new Date(asOf.getTime() + 90 * 86_400_000))
        )
      );
    const billIds = bills.map((bill) => bill.id);
    const paidRows =
      billIds.length === 0
        ? []
        : await this.db
            .select({
              billId: transactions.billId,
              total: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                eq(transactions.type, "expense"),
                inArray(transactions.billId, billIds),
                lte(transactions.occurredAt, asOf)
              )
            )
            .groupBy(transactions.billId);
    const paid = new Map(
      paidRows.flatMap((row) => (row.billId === null ? [] : [[row.billId, row.total] as const]))
    );
    const latestOccurredAt = bounded.at(-1)?.occurredAt ?? null;
    const latestUpdatedAt = bounded.reduce<Date | null>(
      (latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest),
      null
    );
    const digest = createHash("sha256")
      .update(
        bounded
          .map((row) => `${row.id}:${row.occurredAt.toISOString()}:${row.amountMinor}`)
          .join("|"),
        "utf8"
      )
      .digest("hex");
    return {
      transactions: bounded,
      recurringTransactionIds: new Set(members.map((member) => member.transactionId)),
      knownStreams: streams,
      liquidBalanceMinor: liquid.reduce((total, row) => total + row.balanceMinor, 0),
      billsDue: bills.map((bill) => ({ ...bill, paidMinor: paid.get(bill.id) ?? 0 })),
      watermark: CashflowForecastInputWatermarkSchema.parse({
        asOf,
        latestOccurredAt,
        latestUpdatedAt,
        rowCount: bounded.length,
        digest
      }),
      rowBudgetHit: rows.length > bounded.length
    };
  }

  /** Worker scheduler discovery only: returns tenant identifiers, never financial rows. */
  async systemFindUsersNeedingForecast(asOf: Date, limit: number): Promise<readonly string[]> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > CASHFLOW_FORECAST_RESOURCE_CONTRACT.batchSize
    )
      throw new RangeError("Forecast discovery limit exceeds the worker contract.");
    const latest = this.db
      .select({
        userId: cashflowForecastSnapshots.userId,
        computedAt: sql<Date>`max(${cashflowForecastSnapshots.computedAt})`.as("computed_at")
      })
      .from(cashflowForecastSnapshots)
      .groupBy(cashflowForecastSnapshots.userId)
      .as("latest_cashflow_forecast");
    const rows = await this.db
      .select({ userId: transactions.userId })
      .from(transactions)
      .leftJoin(latest, eq(latest.userId, transactions.userId))
      .where(
        and(
          eq(transactions.status, "posted"),
          lte(transactions.occurredAt, asOf),
          sql`(${latest.computedAt} is null or ${latest.computedAt} < ${asOf})`
        )
      )
      .groupBy(transactions.userId, latest.computedAt)
      .orderBy(asc(transactions.userId))
      .limit(limit);
    return rows.map((row) => row.userId);
  }

  async findLatest(userId: string, days: 30 | 60 | 90): Promise<CashflowForecastSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(cashflowForecastSnapshots)
      .where(
        and(
          eq(cashflowForecastSnapshots.userId, userId),
          eq(cashflowForecastSnapshots.horizonDays, days)
        )
      )
      .orderBy(sql`${cashflowForecastSnapshots.computedAt} desc`)
      .limit(1);
    return row === undefined
      ? null
      : CashflowForecastSnapshotSchema.parse({
          ...row,
          inputWatermark: row.inputWatermark,
          sufficiency: row.sufficiency,
          resources: row.resources,
          range: row.range,
          assumptions: row.assumptions,
          metrics: row.metrics,
          shortfall: row.shortfall
        });
  }

  async insertSnapshot(
    userId: string,
    snapshot: CashflowForecastSnapshot
  ): Promise<CashflowForecastSnapshot> {
    const inserted = await withTxn(this.db, async (tx) => {
      const [row] = await tx
        .insert(cashflowForecastSnapshots)
        .values({
          userId,
          asOf: snapshot.asOf,
          horizonDays: snapshot.horizonDays,
          modelVersion: snapshot.modelVersion,
          inputDigest: snapshot.inputWatermark.digest,
          inputWatermark: snapshot.inputWatermark,
          sufficiency: snapshot.sufficiency,
          resources: snapshot.resources,
          model: snapshot.model,
          pointBalanceMinor: snapshot.pointBalanceMinor,
          range: snapshot.range,
          assumptions: snapshot.assumptions,
          metrics: snapshot.metrics,
          shortfall: snapshot.shortfall,
          computedAt: snapshot.computedAt
        })
        .onConflictDoNothing()
        .returning();
      return row;
    });
    if (inserted !== undefined) return CashflowForecastSnapshotSchema.parse(inserted);
    const existing = await this.findExact(userId, snapshot);
    if (existing === null) throw new Error("Forecast snapshot conflict was not found.");
    return existing;
  }
  private async findExact(
    userId: string,
    snapshot: CashflowForecastSnapshot
  ): Promise<CashflowForecastSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(cashflowForecastSnapshots)
      .where(
        and(
          eq(cashflowForecastSnapshots.userId, userId),
          eq(cashflowForecastSnapshots.asOf, snapshot.asOf),
          eq(cashflowForecastSnapshots.horizonDays, snapshot.horizonDays),
          eq(cashflowForecastSnapshots.modelVersion, snapshot.modelVersion),
          eq(cashflowForecastSnapshots.inputDigest, snapshot.inputWatermark.digest)
        )
      )
      .limit(1);
    return row === undefined ? null : CashflowForecastSnapshotSchema.parse(row);
  }
}

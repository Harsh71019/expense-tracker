import { describe, expect, it } from "vitest";

import {
  detectRecurringAmountChanges,
  detectSpendingChanges,
  detectVariableSpendingRegimes,
  type MatureStreamInput,
  type TransactionInput
} from "../detect-spending-changes.js";

describe("Spending Change Detection - Domain Algorithms", () => {
  const userId = "user-test-change-01";
  const asOf = new Date("2026-08-01T00:00:00.000Z");

  function createTxn(
    id: string,
    occurredAt: string,
    amountMinor: number,
    type: "expense" | "income" = "expense"
  ): TransactionInput {
    return {
      id,
      userId,
      type,
      amountMinor,
      occurredAt: new Date(occurredAt),
      createdAt: new Date(occurredAt),
      updatedAt: new Date(occurredAt),
      transferGroupId: null,
      accountType: "bank",
      billId: null,
      status: "posted"
    };
  }

  describe("Recurring-Cost Change Detection", () => {
    it("detects a persistent price increase in a mature stream", () => {
      // Stream with 6 baseline occurrences at 49,900 paise (499 INR), then 3 increased occurrences at 79,900 paise (799 INR)
      const stream: MatureStreamInput = {
        id: "11111111-1111-4111-8111-111111111111",
        userId,
        logicalKey: "stream-sub-01",
        fingerprint: "fp-sub-01",
        cadence: "monthly",
        state: "mature",
        amountBehavior: "fixed",
        medianAmountMinor: 49_900,
        madAmountMinor: 0,
        members: [
          {
            id: "m1",
            transactionId: "t1",
            occurredAt: new Date("2026-01-05T00:00:00Z"),
            amountMinor: 49_900
          },
          {
            id: "m2",
            transactionId: "t2",
            occurredAt: new Date("2026-02-05T00:00:00Z"),
            amountMinor: 49_900
          },
          {
            id: "m3",
            transactionId: "t3",
            occurredAt: new Date("2026-03-05T00:00:00Z"),
            amountMinor: 49_900
          },
          {
            id: "m4",
            transactionId: "t4",
            occurredAt: new Date("2026-04-05T00:00:00Z"),
            amountMinor: 49_900
          },
          {
            id: "m5",
            transactionId: "t5",
            occurredAt: new Date("2026-05-05T00:00:00Z"),
            amountMinor: 49_900
          },
          {
            id: "m6",
            transactionId: "t6",
            occurredAt: new Date("2026-06-05T00:00:00Z"),
            amountMinor: 79_900
          },
          {
            id: "m7",
            transactionId: "t7",
            occurredAt: new Date("2026-07-05T00:00:00Z"),
            amountMinor: 79_900
          },
          {
            id: "m8",
            transactionId: "t8",
            occurredAt: new Date("2026-08-01T00:00:00Z"),
            amountMinor: 79_900
          }
        ]
      };

      const dummyWatermark = {
        asOf,
        latestOccurredAt: new Date("2026-08-01T00:00:00Z"),
        latestUpdatedAt: new Date("2026-08-01T00:00:00Z"),
        lastTransactionId: "t8",
        rowCount: 8,
        digest: "a".repeat(64)
      };

      const { changes, abstainedCount } = detectRecurringAmountChanges(
        [stream],
        dummyWatermark,
        userId,
        asOf
      );

      expect(abstainedCount).toBe(0);
      expect(changes).toHaveLength(1);
      const change = changes[0];
      expect(change).toBeDefined();
      if (!change) throw new Error("Expected change");
      expect(change.streamId).toBe(stream.id);
      expect(change.direction).toBe("increase");
      expect(change.oldMedianMinor).toBe(49_900);
      expect(change.newMedianMinor).toBe(79_900);
      expect(change.deltaMinor).toBe(30_000);
      expect(change.confidenceBps).toBeGreaterThanOrEqual(7_000);
      expect(change.changeTransactionId).toBe("t6");
    });

    it("detects a persistent price decrease in a mature stream", () => {
      // Stream with 5 baseline occurrences at 120,000 paise, then 3 reduced occurrences at 80,000 paise
      const stream: MatureStreamInput = {
        id: "22222222-2222-4222-8222-222222222222",
        userId,
        logicalKey: "stream-emi-01",
        fingerprint: "fp-emi-01",
        cadence: "monthly",
        state: "mature",
        amountBehavior: "fixed",
        medianAmountMinor: 120_000,
        madAmountMinor: 1_000,
        members: [
          {
            id: "m1",
            transactionId: "t1",
            occurredAt: new Date("2026-01-10T00:00:00Z"),
            amountMinor: 120_000
          },
          {
            id: "m2",
            transactionId: "t2",
            occurredAt: new Date("2026-02-10T00:00:00Z"),
            amountMinor: 120_000
          },
          {
            id: "m3",
            transactionId: "t3",
            occurredAt: new Date("2026-03-10T00:00:00Z"),
            amountMinor: 119_000
          },
          {
            id: "m4",
            transactionId: "t4",
            occurredAt: new Date("2026-04-10T00:00:00Z"),
            amountMinor: 121_000
          },
          {
            id: "m5",
            transactionId: "t5",
            occurredAt: new Date("2026-05-10T00:00:00Z"),
            amountMinor: 80_000
          },
          {
            id: "m6",
            transactionId: "t6",
            occurredAt: new Date("2026-06-10T00:00:00Z"),
            amountMinor: 80_000
          },
          {
            id: "m7",
            transactionId: "t7",
            occurredAt: new Date("2026-07-10T00:00:00Z"),
            amountMinor: 80_000
          }
        ]
      };

      const dummyWatermark = {
        asOf,
        latestOccurredAt: new Date("2026-07-10T00:00:00Z"),
        latestUpdatedAt: new Date("2026-07-10T00:00:00Z"),
        lastTransactionId: "t7",
        rowCount: 7,
        digest: "b".repeat(64)
      };

      const { changes } = detectRecurringAmountChanges([stream], dummyWatermark, userId, asOf);
      expect(changes).toHaveLength(1);
      const change = changes[0];
      expect(change).toBeDefined();
      if (!change) throw new Error("Expected change");
      expect(change.direction).toBe("decrease");
      expect(change.oldMedianMinor).toBe(120_000);
      expect(change.newMedianMinor).toBe(80_000);
      expect(change.deltaMinor).toBe(40_000);
    });

    it("rejects a single one-off spike (outlier suppression)", () => {
      // 5 baseline at 50,000, 1 spike at 200,000, then reverts to 50,000
      const stream: MatureStreamInput = {
        id: "33333333-3333-4333-8333-333333333333",
        userId,
        logicalKey: "stream-spike-01",
        fingerprint: "fp-spike-01",
        cadence: "monthly",
        state: "mature",
        amountBehavior: "fixed",
        medianAmountMinor: 50_000,
        madAmountMinor: 0,
        members: [
          {
            id: "m1",
            transactionId: "t1",
            occurredAt: new Date("2026-01-01T00:00:00Z"),
            amountMinor: 50_000
          },
          {
            id: "m2",
            transactionId: "t2",
            occurredAt: new Date("2026-02-01T00:00:00Z"),
            amountMinor: 50_000
          },
          {
            id: "m3",
            transactionId: "t3",
            occurredAt: new Date("2026-03-01T00:00:00Z"),
            amountMinor: 50_000
          },
          {
            id: "m4",
            transactionId: "t4",
            occurredAt: new Date("2026-04-01T00:00:00Z"),
            amountMinor: 50_000
          },
          {
            id: "m5",
            transactionId: "t5",
            occurredAt: new Date("2026-05-01T00:00:00Z"),
            amountMinor: 200_000
          }, // Outlier spike
          {
            id: "m6",
            transactionId: "t6",
            occurredAt: new Date("2026-06-01T00:00:00Z"),
            amountMinor: 50_000
          }, // Reverted
          {
            id: "m7",
            transactionId: "t7",
            occurredAt: new Date("2026-07-01T00:00:00Z"),
            amountMinor: 50_000
          } // Reverted
        ]
      };

      const dummyWatermark = {
        asOf,
        latestOccurredAt: new Date("2026-07-01T00:00:00Z"),
        latestUpdatedAt: new Date("2026-07-01T00:00:00Z"),
        lastTransactionId: "t7",
        rowCount: 7,
        digest: "c".repeat(64)
      };

      const { changes } = detectRecurringAmountChanges([stream], dummyWatermark, userId, asOf);
      expect(changes).toHaveLength(0); // Outlier correctly rejected!
    });

    it("abstains on insufficient observations (warm-up rule)", () => {
      const stream: MatureStreamInput = {
        id: "44444444-4444-4444-8444-444444444444",
        userId,
        logicalKey: "stream-short-01",
        fingerprint: "fp-short-01",
        cadence: "monthly",
        state: "mature",
        amountBehavior: "fixed",
        medianAmountMinor: 50_000,
        madAmountMinor: 0,
        members: [
          {
            id: "m1",
            transactionId: "t1",
            occurredAt: new Date("2026-01-01T00:00:00Z"),
            amountMinor: 50_000
          },
          {
            id: "m2",
            transactionId: "t2",
            occurredAt: new Date("2026-02-01T00:00:00Z"),
            amountMinor: 50_000
          }
        ]
      };

      const dummyWatermark = {
        asOf,
        latestOccurredAt: new Date("2026-02-01T00:00:00Z"),
        latestUpdatedAt: new Date("2026-02-01T00:00:00Z"),
        lastTransactionId: "t2",
        rowCount: 2,
        digest: "d".repeat(64)
      };

      const { changes, abstainedCount } = detectRecurringAmountChanges(
        [stream],
        dummyWatermark,
        userId,
        asOf
      );
      expect(changes).toHaveLength(0);
      expect(abstainedCount).toBe(1);
    });
  });

  describe("Personal Variable Spending-Regime Change Detection", () => {
    it("detects upward regime shift in variable lifestyle expenditure", () => {
      const rows: TransactionInput[] = [];
      const recurringIds = new Set<string>();

      // Lookback is 365 days. Generate 16 weeks of daily spending:
      // Weeks 0..9 (baseline): ~20,000 paise (200 INR) daily -> ~140,000 weekly
      // Weeks 10..15 (shifted): ~50,000 paise (500 INR) daily -> ~350,000 weekly
      const startDate = new Date(asOf.getTime() - 16 * 7 * 86_400_000);

      for (let day = 0; day < 16 * 7; day++) {
        const d = new Date(startDate.getTime() + day * 86_400_000);
        const isShift = day >= 10 * 7;
        const amount = isShift ? 50_000 : 20_000;
        rows.push(createTxn(`txn-${day}`, d.toISOString(), amount));
      }

      const dummyWatermark = {
        asOf,
        latestOccurredAt: asOf,
        latestUpdatedAt: asOf,
        lastTransactionId: "txn-111",
        rowCount: rows.length,
        digest: "e".repeat(64)
      };

      const { regimes, abstained } = detectVariableSpendingRegimes(
        rows,
        recurringIds,
        dummyWatermark,
        userId,
        asOf
      );

      expect(abstained).toBe(false);
      expect(regimes).toHaveLength(1);
      const regime = regimes[0];
      expect(regime).toBeDefined();
      if (!regime) throw new Error("Expected regime");
      expect(regime.direction).toBe("increase");
      expect(regime.baselineMedianMinor).toBe(140_000);
      expect(regime.newMedianMinor).toBe(350_000);
      expect(regime.deltaMinor).toBe(210_000);
      expect(regime.confidenceBps).toBeGreaterThanOrEqual(6_500);
    });

    it("rejects isolated holiday spending spike without persistent regime shift", () => {
      const rows: TransactionInput[] = [];
      const recurringIds = new Set<string>();
      const startDate = new Date(asOf.getTime() - 16 * 7 * 86_400_000);

      for (let day = 0; day < 16 * 7; day++) {
        const d = new Date(startDate.getTime() + day * 86_400_000);
        // Week 8 day 3 has a huge 300,000 spike, but rest of week 8 and week 9..15 remain baseline (20,000)
        const isHolidaySpike = day === 8 * 7 + 3;
        const amount = isHolidaySpike ? 300_000 : 20_000;
        rows.push(createTxn(`txn-${day}`, d.toISOString(), amount));
      }

      const dummyWatermark = {
        asOf,
        latestOccurredAt: asOf,
        latestUpdatedAt: asOf,
        lastTransactionId: "txn-111",
        rowCount: rows.length,
        digest: "f".repeat(64)
      };

      const { regimes } = detectVariableSpendingRegimes(
        rows,
        recurringIds,
        dummyWatermark,
        userId,
        asOf
      );

      // Single week spike does not persist for 2 consecutive weeks -> no regime shift
      expect(regimes).toHaveLength(0);
    });

    it("abstains on sparse or insufficient variable spending history", () => {
      const rows = [
        createTxn("t1", "2026-07-01T00:00:00Z", 20_000),
        createTxn("t2", "2026-07-05T00:00:00Z", 30_000)
      ];

      const dummyWatermark = {
        asOf,
        latestOccurredAt: new Date("2026-07-05T00:00:00Z"),
        latestUpdatedAt: new Date("2026-07-05T00:00:00Z"),
        lastTransactionId: "t2",
        rowCount: 2,
        digest: "0".repeat(64)
      };

      const { regimes, abstained } = detectVariableSpendingRegimes(
        rows,
        new Set(),
        dummyWatermark,
        userId,
        asOf
      );
      expect(regimes).toHaveLength(0);
      expect(abstained).toBe(true);
    });
  });

  describe("End-to-End detectSpendingChanges", () => {
    it("coordinates recurring and variable spending change detection deterministically", () => {
      const rows: TransactionInput[] = [];
      const streams: MatureStreamInput[] = [
        {
          id: "stream-net-01",
          userId,
          logicalKey: "key-net-01",
          fingerprint: "fp-net-01",
          cadence: "monthly",
          state: "mature",
          amountBehavior: "fixed",
          medianAmountMinor: 69_900,
          madAmountMinor: 0,
          members: [
            {
              id: "m1",
              transactionId: "rec-1",
              occurredAt: new Date("2026-01-01T00:00:00Z"),
              amountMinor: 69_900
            },
            {
              id: "m2",
              transactionId: "rec-2",
              occurredAt: new Date("2026-02-01T00:00:00Z"),
              amountMinor: 69_900
            },
            {
              id: "m3",
              transactionId: "rec-3",
              occurredAt: new Date("2026-03-01T00:00:00Z"),
              amountMinor: 69_900
            },
            {
              id: "m4",
              transactionId: "rec-4",
              occurredAt: new Date("2026-04-01T00:00:00Z"),
              amountMinor: 69_900
            },
            {
              id: "m5",
              transactionId: "rec-5",
              occurredAt: new Date("2026-05-01T00:00:00Z"),
              amountMinor: 89_900
            },
            {
              id: "m6",
              transactionId: "rec-6",
              occurredAt: new Date("2026-06-01T00:00:00Z"),
              amountMinor: 89_900
            },
            {
              id: "m7",
              transactionId: "rec-7",
              occurredAt: new Date("2026-07-01T00:00:00Z"),
              amountMinor: 89_900
            }
          ]
        }
      ];

      // Add recurring transactions to rows
      for (const m of streams[0]?.members ?? []) {
        rows.push(createTxn(m.transactionId, m.occurredAt.toISOString(), m.amountMinor));
      }

      // Add 16 weeks of variable expenses with regime shift
      const startDate = new Date(asOf.getTime() - 16 * 7 * 86_400_000);
      for (let day = 0; day < 16 * 7; day++) {
        const d = new Date(startDate.getTime() + day * 86_400_000);
        const isShift = day >= 10 * 7;
        const amount = isShift ? 40_000 : 15_000;
        rows.push(createTxn(`var-${day}`, d.toISOString(), amount));
      }

      const res1 = detectSpendingChanges(rows, streams, userId, asOf);
      const res2 = detectSpendingChanges(rows, streams, userId, asOf);

      // Deterministic output
      expect(res1.watermark.digest).toBe(res2.watermark.digest);
      expect(res1.recurringChanges).toHaveLength(1);
      expect(res2.recurringChanges).toHaveLength(1);
      expect(res1.recurringChanges[0]?.newMedianMinor).toBe(89_900);
      expect(res1.spendingRegimes).toHaveLength(1);
      expect(res2.spendingRegimes).toHaveLength(1);
      expect(res1.spendingRegimes[0]?.direction).toBe("increase");
      expect(res1.resources.outcome.status).toBe("completed");
    });

    it("prevents future-data leakage by completely ignoring transactions after asOf", () => {
      const rows: TransactionInput[] = [];
      const streams: MatureStreamInput[] = [];
      const pastDate = new Date("2026-06-01T00:00:00.000Z");

      // Generate 16 weeks of steady spending before pastDate
      const startDate = new Date(pastDate.getTime() - 16 * 7 * 86_400_000);
      for (let day = 0; day < 16 * 7; day++) {
        const d = new Date(startDate.getTime() + day * 86_400_000);
        rows.push(createTxn(`past-${day}`, d.toISOString(), 20_000));
      }

      // Add future massive shifts after pastDate (in July 2026)
      for (let day = 0; day < 30; day++) {
        const d = new Date(pastDate.getTime() + (day + 1) * 86_400_000);
        rows.push(createTxn(`future-${day}`, d.toISOString(), 1_000_000));
      }

      // Evaluate at pastDate
      const resultAtPast = detectSpendingChanges(rows, streams, userId, pastDate);
      expect(resultAtPast.spendingRegimes).toHaveLength(0); // Steady history up to pastDate -> no regime shift
    });

    it("excludes reversed transactions, reversals, and transfer groups from variable spending", () => {
      const rows: TransactionInput[] = [];
      const startDate = new Date(asOf.getTime() - 16 * 7 * 86_400_000);

      // Baseline rows
      for (let day = 0; day < 16 * 7; day++) {
        const d = new Date(startDate.getTime() + day * 86_400_000);
        rows.push(createTxn(`base-${day}`, d.toISOString(), 15_000));
      }

      // Add reversed transaction with huge amount
      rows.push({
        ...createTxn("rev-1", "2026-07-01T00:00:00Z", 500_000),
        status: "reversed"
      });

      // Add reversal entry with huge amount
      rows.push({
        ...createTxn("rev-2", "2026-07-01T00:00:00Z", 500_000),
        status: "reversal"
      });

      // Add transfer group transaction
      rows.push({
        ...createTxn("trf-1", "2026-07-01T00:00:00Z", 500_000),
        transferGroupId: "99999999-9999-4999-8999-999999999999"
      });

      const res = detectSpendingChanges(rows, [], userId, asOf);
      // Because reversed/transfer items are excluded, spending remains at 15_000 steady -> no false regime shift
      expect(res.spendingRegimes).toHaveLength(0);
    });

    it("returns degraded resource limit outcome when row budget is hit", () => {
      const rows = [createTxn("t1", "2026-07-01T00:00:00Z", 20_000)];
      const res = detectSpendingChanges(rows, [], userId, asOf, { rowBudgetHit: true });
      expect(res.resources.rowBudgetHit).toBe(true);
      expect(res.resources.outcome.status).toBe("degraded");
    });
  });
});

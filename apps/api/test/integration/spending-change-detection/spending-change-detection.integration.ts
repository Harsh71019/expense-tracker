import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../../../src/accounts/balance-delta.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts as accountsTable,
  detectedRecurringStreamChanges,
  detectedRecurringStreamMembers,
  detectedRecurringStreams,
  notificationOutbox,
  recurringRules,
  spendingChangeDetectionRuns,
  spendingRegimes,
  transactions
} from "../../../src/common/db/schema/index.js";
import { MetricsService } from "../../../src/common/observability/metrics.service.js";
import { RedisService } from "../../../src/common/redis/redis.service.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { SpendingChangeDetectionRepository } from "../../../src/spending-change-detection/spending-change-detection.repository.js";
import { SpendingChangeDetectionService } from "../../../src/spending-change-detection/spending-change-detection.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_A = "spending-change-user-a";
const USER_B = "spending-change-user-b";
const AS_OF = new Date("2026-08-01T12:00:00.000Z");

describe("SpendingChangeDetectionService (integration)", () => {
  let testDb: TestDb;
  let repository: SpendingChangeDetectionRepository;
  let service: SpendingChangeDetectionService;
  let accountA: string;
  let accountB: string;
  let accounts: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_A);
    await insertTestUser(testDb.db, USER_B);
    accounts = new AccountRepository(testDb.db);
    accountA = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(USER_A, { name: "Bank A", type: "bank", openingBalanceMinor: 0 }, tx)
      )
    ).id;
    accountB = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(USER_B, { name: "Bank B", type: "bank", openingBalanceMinor: 0 }, tx)
      )
    ).id;
    repository = new SpendingChangeDetectionRepository(testDb.db);
    const metrics = new MetricsService(
      focusedTestDouble<RedisService>({
        get: vi.fn(),
        set: vi.fn(),
        hashIncrementBy: vi.fn(async () => 1)
      })
    );
    service = new SpendingChangeDetectionService(repository, metrics);
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`
      truncate table spending_regimes,
        detected_recurring_stream_changes,
        spending_change_detection_runs,
        detected_recurring_stream_members,
        detected_recurring_streams,
        transactions cascade
    `);
    await testDb.db
      .update(accountsTable)
      .set({ balanceMinor: 0 })
      .where(inArray(accountsTable.id, [accountA, accountB]));
  });

  async function insertTxn(
    userId: string,
    accountId: string,
    type: "expense" | "income",
    amountMinor: number,
    occurredAtStr: string,
    description: string,
    extra: { transferGroupId?: string | null } = {}
  ): Promise<string> {
    const id = crypto.randomUUID();
    const occurredAt = new Date(occurredAtStr);
    await withTxn(testDb.db, async (tx) => {
      await tx.insert(transactions).values({
        id,
        userId,
        accountId,
        type,
        amountMinor,
        currency: "INR",
        description,
        tags: [],
        occurredAt,
        source: "manual",
        status: "posted",
        transferGroupId: extra.transferGroupId ?? null,
        createdAt: occurredAt,
        updatedAt: occurredAt
      });
      const balanceDelta = type === "income" ? amountMinor : -amountMinor;
      assertBalanceDeltaApplied(
        await accounts.applyBalanceDelta(userId, accountId, balanceDelta, tx)
      );
    });
    return id;
  }

  it("bounds history, isolates tenants, and returns discovery candidates safely", async () => {
    // Seed transactions for USER_A and USER_B
    await insertTxn(USER_A, accountA, "expense", 10_000, "2026-06-01T00:00:00Z", "COFFEE A");
    await insertTxn(USER_A, accountA, "expense", 20_000, "2026-06-02T00:00:00Z", "COFFEE A");
    await insertTxn(USER_B, accountB, "expense", 30_000, "2026-06-01T00:00:00Z", "COFFEE B");

    // Check bounded history tenant isolation
    const historyA = await repository.findBoundedHistory(USER_A, AS_OF, {
      lookbackDays: 365,
      maxRows: 1
    });

    expect(historyA.rowBudgetHit).toBe(true);
    expect(historyA.rows).toHaveLength(1);
    expect(historyA.rows[0]?.userId).toBe(USER_A);
    expect(historyA.rows.every((r) => r.userId === USER_A)).toBe(true);

    // Check system discovery method across tenants
    const candidateUsers = await repository.systemFindUsersNeedingRefresh(AS_OF, 10);
    expect(candidateUsers).toContain(USER_A);
    expect(candidateUsers).toContain(USER_B);

    await assertLedgerInvariants(testDb.db);
  });

  it("detects recurring price increase, persists derived stream, and leaves rules/outbox untouched", async () => {
    // 1. Insert a mature stream with 5 baseline occurrences at 49,900 paise, then 3 increased occurrences at 79,900 paise
    const streamId = crypto.randomUUID();
    const dates = [
      "2026-01-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      "2026-03-01T00:00:00Z",
      "2026-04-01T00:00:00Z",
      "2026-05-01T00:00:00Z",
      "2026-06-01T00:00:00Z",
      "2026-07-01T00:00:00Z",
      "2026-07-28T00:00:00Z"
    ];

    const txnIds: string[] = [];
    for (let i = 0; i < dates.length; i++) {
      const amount = i >= 5 ? 79_900 : 49_900;
      const dateStr = dates[i];
      if (!dateStr) continue;
      const tId = await insertTxn(USER_A, accountA, "expense", amount, dateStr, "STREAM-SUB");
      txnIds.push(tId);
    }

    await testDb.db.insert(detectedRecurringStreams).values({
      id: streamId,
      userId: USER_A,
      logicalKey: "key-sub-01",
      fingerprint: "fp-sub-01",
      counterpartyKey: "netflix",
      transactionType: "expense",
      cadence: "monthly",
      state: "mature",
      amountBehavior: "fixed",
      medianAmountMinor: 49_900,
      madAmountMinor: 0,
      confidenceBps: 9_000,
      nextExpectedDate: "2026-08-28",
      supersedesStreamId: null,
      detectorVersion: 1,
      inputWatermark: {
        asOf: AS_OF,
        latestOccurredAt: new Date("2026-07-28T00:00:00Z"),
        latestUpdatedAt: new Date("2026-07-28T00:00:00Z"),
        lastTransactionId: txnIds.at(-1) ?? "txn-last",
        rowCount: dates.length,
        digest: "stream-digest"
      },
      sufficiency: { status: "sufficient", observationCount: dates.length, minimumRequired: 4 },
      evidence: { cadenceEvidence: "monthly", sampleCount: dates.length },
      computedAt: AS_OF
    });

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      const tId = txnIds[i];
      if (!dateStr || !tId) continue;
      await testDb.db.insert(detectedRecurringStreamMembers).values({
        id: crypto.randomUUID(),
        userId: USER_A,
        streamId,
        transactionId: tId,
        residualDays: 0,
        normalizerVersion: 1,
        createdAt: new Date(dateStr)
      });
    }

    // 2. Run analysis
    const result = await service.analyzeUser(USER_A, AS_OF);

    expect(result.status).toBe("completed");
    expect(result.recurringChangesCount).toBe(1);

    // 3. Verify detected_recurring_stream_changes record
    const changes = await testDb.db
      .select()
      .from(detectedRecurringStreamChanges)
      .where(eq(detectedRecurringStreamChanges.userId, USER_A));

    expect(changes).toHaveLength(1);
    const change = changes[0];
    expect(change).toBeDefined();
    if (!change) throw new Error("Expected change");
    expect(change.streamId).toBe(streamId);
    expect(change.direction).toBe("increase");
    expect(change.oldMedianMinor).toBe(49_900);
    expect(change.newMedianMinor).toBe(79_900);
    expect(change.deltaMinor).toBe(30_000);

    // 4. Verify derived stream in detected_recurring_streams
    const allStreams = await testDb.db
      .select()
      .from(detectedRecurringStreams)
      .where(eq(detectedRecurringStreams.userId, USER_A));

    expect(allStreams).toHaveLength(2);
    const derivedStream = allStreams.find((s) => s.supersedesStreamId === streamId);
    expect(derivedStream).toBeDefined();
    expect(derivedStream?.medianAmountMinor).toBe(79_900);

    // 5. Shadow-mode verification: no recurring_rules created, no notifications
    const rules = await testDb.db.select().from(recurringRules);
    expect(rules).toHaveLength(0);

    const outbox = await testDb.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(0);

    await assertLedgerInvariants(testDb.db);
  });

  it("detects personal variable spending regime shift", async () => {
    // 16 weeks of daily transactions for USER_A
    const startDate = new Date(AS_OF.getTime() - 16 * 7 * 86_400_000);
    for (let day = 0; day < 16 * 7; day++) {
      const d = new Date(startDate.getTime() + day * 86_400_000);
      const isShift = day >= 10 * 7;
      const amount = isShift ? 50_000 : 20_000;
      await insertTxn(USER_A, accountA, "expense", amount, d.toISOString(), "GROCERIES");
    }

    const result = await service.analyzeUser(USER_A, AS_OF);

    expect(result.status).toBe("completed");
    expect(result.regimesCount).toBe(1);

    const regimes = await testDb.db
      .select()
      .from(spendingRegimes)
      .where(eq(spendingRegimes.userId, USER_A));

    expect(regimes).toHaveLength(1);
    const regime = regimes[0];
    expect(regime).toBeDefined();
    if (!regime) throw new Error("Expected regime");
    expect(regime.direction).toBe("increase");
    expect(regime.baselineMedianMinor).toBe(140_000);
    expect(regime.newMedianMinor).toBe(350_000);
    expect(regime.deltaMinor).toBe(210_000);

    await assertLedgerInvariants(testDb.db);
  });

  it("handles parallel concurrency safely with idempotent run execution", async () => {
    await insertTxn(USER_A, accountA, "expense", 50_000, "2026-06-01T00:00:00Z", "SHOPPING");
    await insertTxn(USER_A, accountA, "expense", 50_000, "2026-06-02T00:00:00Z", "SHOPPING");

    const attempts = await Promise.all([
      service.analyzeUser(USER_A, AS_OF),
      service.analyzeUser(USER_A, AS_OF),
      service.analyzeUser(USER_A, AS_OF),
      service.analyzeUser(USER_A, AS_OF),
      service.analyzeUser(USER_A, AS_OF)
    ]);

    expect(attempts).toHaveLength(5);
    const firstId = attempts[0]?.id;
    expect(firstId).toBeDefined();
    expect(attempts.every((res) => res.id === firstId)).toBe(true);

    const runs = await testDb.db
      .select()
      .from(spendingChangeDetectionRuns)
      .where(eq(spendingChangeDetectionRuns.userId, USER_A));

    expect(runs).toHaveLength(1);

    await assertLedgerInvariants(testDb.db);
  });
});

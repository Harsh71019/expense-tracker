import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../../../src/accounts/balance-delta.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts as accountsTable,
  detectedRecurringStreamMembers,
  detectedRecurringStreams,
  notificationOutbox,
  recurringDetectionRuns,
  recurringRules,
  transactions
} from "../../../src/common/db/schema/index.js";
import { MetricsService } from "../../../src/common/observability/metrics.service.js";
import { RedisService } from "../../../src/common/redis/redis.service.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { RecurringDetectionRepository } from "../../../src/recurring-detection/recurring-detection.repository.js";
import { RecurringDetectionService } from "../../../src/recurring-detection/recurring-detection.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_A = "recurring-detection-a";
const USER_B = "recurring-detection-b";
const AS_OF = new Date("2026-04-30T12:00:00.000Z");

describe("RecurringDetectionService (integration)", () => {
  let testDb: TestDb;
  let repository: RecurringDetectionRepository;
  let service: RecurringDetectionService;
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
        accounts.create(USER_A, { name: "Cash A", type: "cash", openingBalanceMinor: 0 }, tx)
      )
    ).id;
    accountB = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(USER_B, { name: "Cash B", type: "cash", openingBalanceMinor: 0 }, tx)
      )
    ).id;
    repository = new RecurringDetectionRepository(testDb.db);
    const metrics = new MetricsService(
      focusedTestDouble<RedisService>({
        get: vi.fn(),
        set: vi.fn(),
        hashIncrementBy: vi.fn(async () => 1)
      })
    );
    service = new RecurringDetectionService(repository, metrics);
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`
      truncate table detected_recurring_stream_members,
        detected_recurring_streams,
        recurring_detection_runs,
        transactions cascade
    `);
    await testDb.db
      .update(accountsTable)
      .set({ balanceMinor: 0 })
      .where(inArray(accountsTable.id, [accountA, accountB]));
  });

  it("bounds history, excludes transfers, and preserves tenant ownership", async () => {
    await seedMonthly(USER_A, accountA, "STREAM A", 100_000);
    const transferGroupId = "00000000-0000-4000-8000-000000000900";
    await insertTransaction(USER_A, accountA, "expense", 900_000, "2026-04-15", "TRANSFER", {
      transferGroupId
    });
    await insertTransaction(USER_A, accountA, "income", 900_000, "2026-04-15", "TRANSFER", {
      transferGroupId
    });
    await seedMonthly(USER_B, accountB, "STREAM B", 200_000);

    const history = await repository.findBoundedHistory(USER_A, AS_OF, {
      lookbackDays: 365,
      maxRows: 2
    });

    expect(history.rowBudgetHit).toBe(true);
    expect(history.rows).toHaveLength(2);
    expect(new Set(history.rows.map((row) => row.userId))).toEqual(new Set([USER_A]));
    expect(history.rows.every((row) => row.description === "STREAM A")).toBe(true);
    await expect(
      repository.findBoundedHistory(USER_A, AS_OF, { lookbackDays: 365, maxRows: 5_001 })
    ).rejects.toThrow("worker contract");
    await expect(repository.systemFindUsersNeedingRefresh(AS_OF, 201)).rejects.toThrow(
      "worker contract"
    );
    await assertLedgerInvariants(testDb.db);
  });

  it("system discovery returns owning user ids and tenant-scoped analysis writes only that tenant", async () => {
    await seedMonthly(USER_A, accountA, "ACME SALARY", 500_000, "income");
    await seedMonthly(USER_B, accountB, "HOME RENT", 250_000);

    await expect(repository.systemFindUsersNeedingRefresh(AS_OF, 200)).resolves.toEqual([
      USER_A,
      USER_B
    ]);
    const ledgerBefore = await testDb.db.select().from(transactions);
    await service.analyzeUser(USER_A, AS_OF);

    const streams = await testDb.db.select().from(detectedRecurringStreams);
    const members = await testDb.db.select().from(detectedRecurringStreamMembers);
    expect(streams).toHaveLength(1);
    expect(streams[0]?.userId).toBe(USER_A);
    expect(members).toHaveLength(3);
    expect(new Set(members.map((member) => member.userId))).toEqual(new Set([USER_A]));
    expect(await testDb.db.select().from(transactions)).toEqual(ledgerBefore);
    expect(await testDb.db.select().from(recurringRules)).toEqual([]);
    expect(await testDb.db.select().from(notificationOutbox)).toEqual([]);
    await assertLedgerInvariants(testDb.db);
  });

  it("converges five concurrent identical jobs on one run, stream, and membership set", async () => {
    await seedMonthly(USER_A, accountA, "HOME RENT", 250_000);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.analyzeUser(USER_A, AS_OF))
    );

    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await testDb.db.select().from(recurringDetectionRuns)).toHaveLength(1);
    expect(await testDb.db.select().from(detectedRecurringStreams)).toHaveLength(1);
    expect(await testDb.db.select().from(detectedRecurringStreamMembers)).toHaveLength(3);
    await assertLedgerInvariants(testDb.db);
  });

  it("creates a superseding immutable revision when materially new evidence arrives", async () => {
    await seedMonthly(USER_A, accountA, "HOME RENT", 250_000);
    await service.analyzeUser(USER_A, new Date("2026-03-31T12:00:00.000Z"));
    const [first] = await testDb.db.select().from(detectedRecurringStreams);
    if (first === undefined) throw new Error("expected first recurring stream revision");

    await insertTransaction(USER_A, accountA, "expense", 275_000, "2026-04-01", "HOME RENT");
    await service.analyzeUser(USER_A, AS_OF);
    const revisions = await testDb.db
      .select()
      .from(detectedRecurringStreams)
      .orderBy(asc(detectedRecurringStreams.computedAt));

    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toEqual(first);
    expect(revisions[1]?.supersedesStreamId).toBe(first.id);
    expect(revisions[1]?.fingerprint).not.toBe(first.fingerprint);
    await assertLedgerInvariants(testDb.db);
  });

  it("does not let a late failed attempt downgrade a completed shared run", async () => {
    await seedMonthly(USER_A, accountA, "HOME RENT", 250_000);
    const completed = await service.analyzeUser(USER_A, AS_OF);

    await repository.markRunFailed(USER_A, completed.id, "late_worker_failure");

    const [run] = await testDb.db
      .select()
      .from(recurringDetectionRuns)
      .where(eq(recurringDetectionRuns.id, completed.id));
    expect(run?.status).toBe("completed");
    expect(run?.failureCode).toBeNull();
    await assertLedgerInvariants(testDb.db);
  });

  it("returns no rows when a different tenant asks for another tenant's derived identity", async () => {
    await seedMonthly(USER_A, accountA, "HOME RENT", 250_000);
    await service.analyzeUser(USER_A, AS_OF);
    const [stream] = await testDb.db.select().from(detectedRecurringStreams);
    if (stream === undefined) throw new Error("expected detected stream");

    const otherTenantRows = await testDb.db
      .select()
      .from(detectedRecurringStreams)
      .where(eq(detectedRecurringStreams.userId, USER_B));
    expect(otherTenantRows).toEqual([]);
    expect(stream.userId).toBe(USER_A);
    await assertLedgerInvariants(testDb.db);
  });

  async function seedMonthly(
    userId: string,
    accountId: string,
    description: string,
    amountMinor: number,
    type: "expense" | "income" = "expense"
  ): Promise<void> {
    for (const date of ["2026-01-01", "2026-02-01", "2026-03-01"]) {
      await insertTransaction(userId, accountId, type, amountMinor, date, description);
    }
  }

  async function insertTransaction(
    userId: string,
    accountId: string,
    type: "expense" | "income",
    amountMinor: number,
    date: string,
    description: string,
    options: Readonly<{ transferGroupId?: string }> = {}
  ): Promise<void> {
    const occurredAt = new Date(`${date}T12:00:00.000Z`);
    await withTxn(testDb.db, async (tx) => {
      await tx.insert(transactions).values({
        userId,
        accountId,
        type,
        amountMinor,
        currency: "INR",
        occurredAt,
        description,
        tags: [],
        source: "manual",
        status: "posted",
        transferGroupId: options.transferGroupId ?? null,
        createdAt: occurredAt,
        updatedAt: occurredAt
      });
      assertBalanceDeltaApplied(
        await accounts.applyBalanceDelta(
          userId,
          accountId,
          type === "income" ? amountMinor : -amountMinor,
          tx
        )
      );
    });
  }
});

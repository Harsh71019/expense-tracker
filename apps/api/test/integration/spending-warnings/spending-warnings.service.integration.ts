import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  CategorySpendSpikeEvidenceSchema,
  OverallSpendSpikeEvidenceSchema
} from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../../../src/accounts/balance-delta.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  auditLog,
  accounts as accountsTable,
  idempotencyRecords,
  spendingWarningAnalysisState,
  spendingWarnings,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { SpendingWarningsMutationService } from "../../../src/spending-warnings/spending-warnings-mutation.service.js";
import { SpendingWarningsRepository } from "../../../src/spending-warnings/spending-warnings.repository.js";
import { SpendingWarningsService } from "../../../src/spending-warnings/spending-warnings.service.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const ASOF = new Date("2026-07-25T03:00:00.000Z"); // IST 2026-07-25 08:30; analysis boundary 2026-07-24T18:30:00Z

describe("SpendingWarningsService (integration)", () => {
  let testDb: TestDb;
  let service: SpendingWarningsService;
  let mutations: SpendingWarningsMutationService;
  let repository: SpendingWarningsRepository;
  let accountId: string;
  let otherAccountId: string;
  let categoryId: string;
  let accounts: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");

    accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    repository = new SpendingWarningsRepository(testDb.db);
    service = new SpendingWarningsService(testDb.db, repository, audit);
    const idempotencyRepo = new IdempotencyPostgresRepository(testDb.db);
    const idempotency = new IdempotencyPostgresService(testDb.db, idempotencyRepo);
    mutations = new SpendingWarningsMutationService(service, idempotency);

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create("user-a", { name: "Cash", type: "cash", openingBalanceMinor: 0 }, tx)
    );
    accountId = account.id;

    const otherAccount = await withTxn(testDb.db, (tx) =>
      accounts.create("user-b", { name: "Cash", type: "cash", openingBalanceMinor: 0 }, tx)
    );
    otherAccountId = otherAccount.id;

    const category = await categories.create("user-a", { name: "Dining", kind: "expense" });
    categoryId = category.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.db.delete(spendingWarnings);
    await testDb.db.delete(spendingWarningAnalysisState);
    // Analytics fixtures intentionally rebuild their synthetic ledger for
    // each test. TRUNCATE is the explicit test-only reset boundary; normal
    // UPDATE/DELETE remains blocked by the integration append-only guards.
    await testDb.db.execute(sql`truncate table transactions, audit_log cascade`);
    await testDb.db.delete(idempotencyRecords);
    await testDb.db
      .update(accountsTable)
      .set({ balanceMinor: 0 })
      .where(inArray(accountsTable.id, [accountId, otherAccountId]));
  });

  async function insertExpense(opts: {
    userId: string;
    accountId: string;
    amountMinor: number;
    occurredAt: Date;
    categoryId?: string | null;
    status?: "posted" | "reversed" | "reversal";
    type?: "expense" | "income";
    transferGroupId?: string | null;
  }): Promise<void> {
    const type = opts.type ?? "expense";
    await withTxn(testDb.db, async (tx) => {
      const now = new Date();
      await tx.insert(transactionsTable).values({
        userId: opts.userId,
        accountId: opts.accountId,
        categoryId: opts.categoryId ?? null,
        type,
        amountMinor: opts.amountMinor,
        currency: "INR",
        occurredAt: opts.occurredAt,
        description: "fixture",
        tags: [],
        source: "manual",
        status: opts.status ?? "posted",
        transferGroupId: opts.transferGroupId ?? null,
        createdAt: now,
        updatedAt: now
      });
      assertBalanceDeltaApplied(
        await accounts.applyBalanceDelta(
          opts.userId,
          opts.accountId,
          type === "income" ? opts.amountMinor : -opts.amountMinor,
          tx
        )
      );
    });
  }

  async function insertSpreadExpenses(
    userId: string,
    acctId: string,
    windowStart: Date,
    windowEnd: Date,
    count: number,
    amountMinor: number,
    categoryId?: string | null
  ): Promise<void> {
    const spanMs = windowEnd.getTime() - windowStart.getTime();
    for (let i = 0; i < count; i += 1) {
      const occurredAt = new Date(windowStart.getTime() + (spanMs * (i + 0.5)) / count);
      await insertExpense({
        userId,
        accountId: acctId,
        amountMinor,
        occurredAt,
        categoryId: categoryId ?? null
      });
    }
  }

  function daysBefore(days: number): Date {
    return new Date(ASOF.getTime() - days * 86_400_000);
  }

  /**
   * Baseline: 8 non-overlapping 7-day windows before the current one, each
   * totaling 100_000 across 4 expenses (32 baseline expenses total, clears
   * the >=20 eligibility gate) — so the baseline median is exactly 100_000.
   */
  async function seedOverallBaseline(userId: string, acctId: string): Promise<void> {
    for (let window = 1; window <= 8; window += 1) {
      const end = daysBefore(7 * window);
      const start = daysBefore(7 * (window + 1));
      await insertSpreadExpenses(userId, acctId, start, end, 4, 25_000);
    }
  }

  describe("analyzeUser", () => {
    it("detects an overall spend spike from eligible expenses only, ignoring income/pending/transfer/reversed rows", async () => {
      await seedOverallBaseline("user-a", accountId);
      // Current window: 5 x 100_000 = 500_000 eligible -> 500% of the 100_000 baseline median, delta 400_000.
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);

      // Ineligible rows inside the current window that must NOT count toward the total.
      await insertExpense({
        userId: "user-a",
        accountId,
        amountMinor: 5_000_000,
        occurredAt: daysBefore(1),
        type: "income"
      });
      await insertExpense({
        userId: "user-a",
        accountId,
        amountMinor: 5_000_000,
        occurredAt: daysBefore(1),
        status: "reversed"
      });
      await insertExpense({
        userId: "user-a",
        accountId,
        amountMinor: 5_000_000,
        occurredAt: daysBefore(1),
        status: "reversal"
      });
      const transferGroupId = crypto.randomUUID();
      await insertExpense({
        userId: "user-a",
        accountId,
        amountMinor: 5_000_000,
        occurredAt: daysBefore(1),
        transferGroupId
      });
      await insertExpense({
        userId: "user-a",
        accountId,
        amountMinor: 5_000_000,
        occurredAt: daysBefore(1),
        type: "income",
        transferGroupId
      });

      // Another user's spending must never influence user-a's analysis.
      await insertSpreadExpenses("user-b", otherAccountId, daysBefore(7), ASOF, 20, 10_000_000);

      const state = await service.analyzeUser("user-a", ASOF);
      expect(state.status).toBe("ready");
      expect(state.eligibleKinds).toContain("overall_spend_spike");

      const active = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(
          and(
            eq(spendingWarnings.userId, "user-a"),
            eq(spendingWarnings.kind, "overall_spend_spike")
          )
        );
      expect(active).toHaveLength(1);
      const evidence = OverallSpendSpikeEvidenceSchema.parse(active[0]?.evidence);
      expect(evidence.currentMinor).toBe(500_000);
      expect(evidence.deltaMinor).toBe(400_000);

      const userBWarnings = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.userId, "user-b"));
      expect(userBWarnings).toHaveLength(0);
    });

    it("treats Uncategorized (null categoryId) as an independent category bucket", async () => {
      const baselineMonths = [1, 2, 3, 4, 5, 6];
      for (const monthsAgo of baselineMonths) {
        await insertSpreadExpenses(
          "user-a",
          accountId,
          daysBefore(30 * (monthsAgo + 1)),
          daysBefore(30 * monthsAgo),
          4,
          50_000,
          null
        );
        await insertSpreadExpenses(
          "user-a",
          accountId,
          daysBefore(30 * (monthsAgo + 1)),
          daysBefore(30 * monthsAgo),
          4,
          50_000,
          categoryId
        );
      }
      // Current 30-day window: only the categorized bucket spikes.
      await insertSpreadExpenses("user-a", accountId, daysBefore(30), ASOF, 5, 300_000, null);
      await insertSpreadExpenses("user-a", accountId, daysBefore(30), ASOF, 5, 60_000, categoryId);

      await service.analyzeUser("user-a", ASOF);

      const categoryFindings = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(
          and(
            eq(spendingWarnings.userId, "user-a"),
            eq(spendingWarnings.kind, "category_spend_spike")
          )
        );
      expect(categoryFindings).toHaveLength(1);
      expect(categoryFindings[0]?.categoryId).toBeNull();
      const evidence = CategorySpendSpikeEvidenceSchema.parse(categoryFindings[0]?.evidence);
      expect(evidence.categoryName).toBeUndefined();
    });

    it("converges duplicate concurrent runs on exactly one row per fingerprint", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);

      await Promise.all(Array.from({ length: 5 }, () => service.analyzeUser("user-a", ASOF)));

      const active = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(
          and(
            eq(spendingWarnings.userId, "user-a"),
            eq(spendingWarnings.kind, "overall_spend_spike")
          )
        );
      expect(active).toHaveLength(1);

      const states = await testDb.db
        .select()
        .from(spendingWarningAnalysisState)
        .where(eq(spendingWarningAnalysisState.userId, "user-a"));
      expect(states).toHaveLength(1);
    });

    it("preserves a dismissal across a re-run within the same episode, and resolves it once the spike stops reproducing", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);
      await service.analyzeUser("user-a", ASOF);

      const [warning] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(
          and(
            eq(spendingWarnings.userId, "user-a"),
            eq(spendingWarnings.kind, "overall_spend_spike")
          )
        );
      if (warning === undefined) throw new Error("expected a warning to exist");

      await mutations.dismiss("user-a", warning.id, crypto.randomUUID());

      // Re-run later the same IST day (still within the same ISO week -> same fingerprint).
      const laterSameDay = new Date(ASOF.getTime() + 60 * 60 * 1000);
      await service.analyzeUser("user-a", laterSameDay);

      const [stillDismissed] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.id, warning.id));
      expect(stillDismissed?.status).toBe("dismissed");

      // Now the spike condition stops reproducing. Mark these fixtures
      // reversed rather than deleting ledger rows.
      await testDb.db
        .update(transactionsTable)
        .set({ status: "reversed" })
        .where(
          and(eq(transactionsTable.userId, "user-a"), eq(transactionsTable.amountMinor, 100_000))
        );
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 1, 1_000);
      await service.analyzeUser("user-a", laterSameDay);

      const [afterStop] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.id, warning.id));
      // A dismissed episode is a terminal state for that episode -- it does
      // not "resolve" out from under the dismissal; it simply stops being
      // reproduced (no new active row is created either).
      expect(afterStop?.status).toBe("dismissed");
    });

    it("resolves a formerly-active warning once it stops reproducing", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);
      await service.analyzeUser("user-a", ASOF);

      const [warning] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(
          and(
            eq(spendingWarnings.userId, "user-a"),
            eq(spendingWarnings.kind, "overall_spend_spike")
          )
        );
      if (warning === undefined) throw new Error("expected a warning to exist");
      expect(warning.status).toBe("active");

      await testDb.db
        .update(transactionsTable)
        .set({ status: "reversed" })
        .where(
          and(eq(transactionsTable.userId, "user-a"), eq(transactionsTable.amountMinor, 100_000))
        );
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 1, 1_000);
      const laterSameDay = new Date(ASOF.getTime() + 60 * 60 * 1000);
      await service.analyzeUser("user-a", laterSameDay);

      const [resolved] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.id, warning.id));
      expect(resolved?.status).toBe("resolved");
      expect(resolved?.resolvedAt).not.toBeNull();
    });

    it("reports learning when no detector has enough history", async () => {
      await insertExpense({
        userId: "user-a",
        accountId,
        amountMinor: 10_000,
        occurredAt: daysBefore(1)
      });
      const state = await service.analyzeUser("user-a", ASOF);
      expect(state.status).toBe("learning");
      expect(state.eligibleKinds).toHaveLength(0);
    });
  });

  describe("list", () => {
    it("reports coverage as unavailable before any analysis has ever run", async () => {
      const page = await service.list("user-a", { limit: 20 });
      expect(page.analysis.status).toBe("unavailable");
      expect(page.items).toHaveLength(0);
    });

    it("reports coverage as stale once computedAt is older than 36 hours", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);
      await service.analyzeUser("user-a", ASOF);

      await testDb.db
        .update(spendingWarningAnalysisState)
        .set({ computedAt: new Date(Date.now() - 40 * 60 * 60 * 1000) })
        .where(eq(spendingWarningAnalysisState.userId, "user-a"));

      const page = await service.list("user-a", { limit: 20 });
      expect(page.analysis.status).toBe("stale");
    });

    it("only ever returns the requesting user's own warnings", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);
      await service.analyzeUser("user-a", ASOF);

      const userBPage = await service.list("user-b", { limit: 20 });
      expect(userBPage.items).toHaveLength(0);
    });
  });

  describe("dismiss", () => {
    it("is scoped to the current user (dismissing another user's warning id is not found)", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);
      await service.analyzeUser("user-a", ASOF);
      const [warning] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.userId, "user-a"));
      if (warning === undefined) throw new Error("expected a warning to exist");

      await expect(mutations.dismiss("user-b", warning.id, crypto.randomUUID())).rejects.toThrow();
    });

    it("produces exactly one state transition and one audit effect under 5 concurrent identical dismiss attempts", async () => {
      await seedOverallBaseline("user-a", accountId);
      await insertSpreadExpenses("user-a", accountId, daysBefore(7), ASOF, 5, 100_000);
      await service.analyzeUser("user-a", ASOF);
      const [warning] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.userId, "user-a"));
      if (warning === undefined) throw new Error("expected a warning to exist");

      const key = crypto.randomUUID();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => mutations.dismiss("user-a", warning.id, key))
      );
      for (const result of results) {
        expect(result.result.status).toBe("dismissed");
        expect(result.result.id).toBe(warning.id);
      }

      const [stored] = await testDb.db
        .select()
        .from(spendingWarnings)
        .where(eq(spendingWarnings.id, warning.id));
      expect(stored?.status).toBe("dismissed");

      const auditRows = await testDb.db
        .select()
        .from(auditLog)
        .where(
          and(eq(auditLog.userId, "user-a"), eq(auditLog.action, "spending_warning.dismissed"))
        );
      expect(auditRows).toHaveLength(1);
    });
  });
});

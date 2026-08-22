import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Transaction } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  notificationOutbox,
  recurringReconciliations,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { RecurringMaterializeService } from "../../../src/recurring/recurring-materialize.service.js";
import { RecurringOccurrenceRepository } from "../../../src/recurring/recurring-occurrence.repository.js";
import { RecurringReconciliationRepository } from "../../../src/recurring/recurring-reconciliation.repository.js";
import { RecurringReconciliationService } from "../../../src/recurring/recurring-reconciliation.service.js";
import { RecurringReconciliationSweepService } from "../../../src/recurring/recurring-reconciliation-sweep.service.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const NOOP_MODULE_REF = {
  get: () => ({ onTransactionReversedInTx: async () => undefined })
};
const USER_ID = "user-a";

describe("RecurringReconciliationService (integration)", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let rules: RecurringRuleRepository;
  let ruleService: RecurringRuleService;
  let transactionRepository: TransactionRepository;
  let transactionsService: TransactionService;
  let reconciliations: RecurringReconciliationRepository;
  let occurrences: RecurringOccurrenceRepository;
  let reconciliationService: RecurringReconciliationService;
  let accountId: string;
  let ruleCounter = 0;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/12";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";
    process.env.SERVICE_ROLE = "worker";

    accounts = new AccountRepository(testDb.db);
    rules = new RecurringRuleRepository(testDb.db);
    ruleService = new RecurringRuleService(
      testDb.db,
      rules,
      accounts,
      new CategoryRepository(testDb.db)
    );
    transactionRepository = new TransactionRepository(testDb.db);

    // RecurringReconciliationService depends on TransactionRepository/
    // AccountRepository directly (not TransactionService) specifically so
    // this isn't circular -- see reverse-transaction-in-tx.ts. That lets it
    // be constructed first and passed straight in as TransactionService's
    // TRANSACTION_CREATED_HOOK below, exercising the *real* create() -> hook
    // -> reconcileIncoming path (including the `source === "api"` gate
    // inside create() itself) rather than each test calling
    // reconcileIncoming by hand.
    reconciliations = new RecurringReconciliationRepository(testDb.db);
    occurrences = new RecurringOccurrenceRepository(testDb.db);
    reconciliationService = new RecurringReconciliationService(
      testDb.db,
      transactionRepository,
      accounts,
      reconciliations,
      occurrences,
      new NotificationOutboxRepository(testDb.db),
      new AuditRepository(testDb.db),
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db)),
      NOOP_LOGGER,
      NOOP_MODULE_REF
    );
    transactionsService = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      new AuditRepository(testDb.db),
      NOOP_LOGGER,
      reconciliationService
    );

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 10_000_000 },
        tx
      )
    );
    accountId = account.id;
  }, 60_000);

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  /**
   * Creates a due monthly rule and immediately materializes it (worker
   * role), returning the posted `recurring`-sourced transaction row -- the
   * bait each test reconciles an incoming `api`-sourced transaction against.
   */
  async function postRecurringTransaction(
    amountMinor: number,
    customDescription?: string
  ): Promise<Transaction> {
    ruleCounter += 1;
    const description = customDescription ?? `Recurring fixture ${ruleCounter}`;
    await ruleService.create(USER_ID, {
      template: { accountId, type: "expense", amountMinor, description, tags: [] },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-01-01T00:00:00.000Z"),
      autoPost: true
    });
    const materializer = new RecurringMaterializeService(
      testDb.db,
      new RuntimeConfigService(),
      rules,
      accounts,
      transactionRepository,
      occurrences,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
    await materializer.materialize();
    const txn = await transactionRepository.findMany(USER_ID, { limit: 200 });
    const posted = txn.items.find(
      (item) => item.description === description && item.source === "recurring"
    );
    if (posted === undefined) throw new Error("Recurring fixture did not materialize.");
    return posted;
  }

  async function postIncomingApiTransaction(
    amountMinor: number,
    occurredAt: Date,
    description = "Bank debit"
  ): Promise<Transaction> {
    const result = await transactionsService.create(
      USER_ID,
      { accountId, type: "expense", amountMinor, occurredAt, description, tags: [] },
      randomUUID(),
      "api"
    );
    return result.transaction;
  }

  async function statusOf(transactionId: string): Promise<string | undefined> {
    const [row] = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId));
    return row?.status;
  }

  async function reconciliationRowFor(incomingTransactionId: string) {
    const [row] = await testDb.db
      .select()
      .from(recurringReconciliations)
      .where(eq(recurringReconciliations.incomingTransactionId, incomingTransactionId));
    return row;
  }

  it("auto-reconciles a clean match: the recurring posting is reversed, the API posting stands", async () => {
    const recurringTxn = await postRecurringTransaction(200_000);

    const incoming = await postIncomingApiTransaction(
      200_000,
      recurringTxn.occurredAt,
      recurringTxn.description
    );

    expect(await statusOf(recurringTxn.id)).toBe("reversed");
    expect(await statusOf(incoming.id)).toBe("posted");

    const row = await reconciliationRowFor(incoming.id);
    expect(row?.status).toBe("auto_matched");
    expect(row?.recurringTransactionId).toBe(recurringTxn.id);
  });

  it("flags two equally-good recurring candidates as ambiguous, without reversing either", async () => {
    const first = await postRecurringTransaction(300_000);
    const second = await postRecurringTransaction(300_000);

    const incoming = await postIncomingApiTransaction(300_000, first.occurredAt);

    expect(await statusOf(first.id)).toBe("posted");
    expect(await statusOf(second.id)).toBe("posted");

    const row = await reconciliationRowFor(incoming.id);
    if (row === undefined) throw new Error("unreachable");
    expect(row.status).toBe("ambiguous");
    expect([...row.candidateRecurringTransactionIds].sort()).toEqual([first.id, second.id].sort());

    const [notification] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, USER_ID),
          eq(notificationOutbox.type, "recurring_reconciliation_pending")
        )
      );
    expect(notification).toBeDefined();

    const pending = await reconciliationService.listPending(USER_ID);
    const listed = pending.find((item) => item.id === row.id);
    if (listed === undefined) throw new Error("Expected the pending row to be listed.");
    expect(listed.incomingTransaction.id).toBe(incoming.id);
    expect(listed.candidateTransactions.map((txn) => txn.id).sort()).toEqual(
      [first.id, second.id].sort()
    );
  });

  it("flags a same-account, in-window candidate with a different amount as amount_mismatch, and resolving it as a duplicate reverses the recurring txn exactly once even when replayed", async () => {
    const recurringTxn = await postRecurringTransaction(400_000);

    const incoming = await postIncomingApiTransaction(450_000, recurringTxn.occurredAt);

    expect(await statusOf(recurringTxn.id)).toBe("posted");
    const row = await reconciliationRowFor(incoming.id);
    expect(row?.status).toBe("amount_mismatch");
    expect(row?.candidateRecurringTransactionIds).toEqual([recurringTxn.id]);
    if (row === undefined) throw new Error("unreachable");
    const reconciliationId = row.id;

    const key = randomUUID();
    const first = await reconciliationService.resolve(
      USER_ID,
      reconciliationId,
      { resolution: "confirmed_duplicate" },
      key
    );
    expect(first.replayed).toBe(false);
    expect(first.result.resolution).toBe("confirmed_duplicate");
    expect(await statusOf(recurringTxn.id)).toBe("reversed");

    const replay = await reconciliationService.resolve(
      USER_ID,
      reconciliationId,
      { resolution: "confirmed_duplicate" },
      key
    );
    expect(replay.replayed).toBe(true);

    const reversalRows = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.reversalOf, recurringTxn.id));
    expect(reversalRows).toHaveLength(1);
  });

  it("resolves an ambiguous reconciliation as confirmed_distinct without reversing anything", async () => {
    const first = await postRecurringTransaction(500_000);
    const second = await postRecurringTransaction(500_000);
    const incoming = await postIncomingApiTransaction(500_000, first.occurredAt);
    const row = await reconciliationRowFor(incoming.id);
    if (row === undefined) throw new Error("unreachable");

    const result = await reconciliationService.resolve(
      USER_ID,
      row.id,
      { resolution: "confirmed_distinct" },
      randomUUID()
    );
    expect(result.result.resolution).toBe("confirmed_distinct");

    expect(await statusOf(first.id)).toBe("posted");
    expect(await statusOf(second.id)).toBe("posted");
  });

  it("reverses only the chosen candidate when resolving an ambiguous reconciliation as a duplicate", async () => {
    const first = await postRecurringTransaction(600_000);
    const second = await postRecurringTransaction(600_000);
    const incoming = await postIncomingApiTransaction(600_000, first.occurredAt);
    const row = await reconciliationRowFor(incoming.id);
    if (row === undefined) throw new Error("unreachable");

    await reconciliationService.resolve(
      USER_ID,
      row.id,
      { resolution: "confirmed_duplicate", chosenRecurringTransactionId: second.id },
      randomUUID()
    );

    expect(await statusOf(first.id)).toBe("posted");
    expect(await statusOf(second.id)).toBe("reversed");
  });

  it("auto-reconciles via a shared mandate reference token even when the amount changed", async () => {
    const recurringTxn = await postRecurringTransaction(199_900, "Anthropic (mandate:YIcCmzpAfi)");

    const incoming = await postIncomingApiTransaction(
      249_900,
      recurringTxn.occurredAt,
      "CARD/EMANDATE/Anthropic/mandate:YIcCmzpAfi"
    );

    expect(await statusOf(recurringTxn.id)).toBe("reversed");
    expect(await statusOf(incoming.id)).toBe("posted");

    const row = await reconciliationRowFor(incoming.id);
    expect(row?.status).toBe("auto_matched");
    expect(row?.recurringTransactionId).toBe(recurringTxn.id);
  });

  it("recovers when the email transaction arrives before the scheduled placeholder", async () => {
    ruleCounter += 1;
    const description = `Email-first fixture ${ruleCounter}`;
    const rule = await ruleService.create(USER_ID, {
      template: {
        accountId,
        type: "expense",
        amountMinor: 199_900,
        description,
        tags: []
      },
      rrule: "FREQ=DAILY",
      startAt: new Date(Date.now() - 24 * 60 * 60 * 1_000),
      autoPost: true
    });

    const incoming = await postIncomingApiTransaction(
      199_900,
      rule.nextRunAt,
      `CARD/DR/EMANDATE/${description}/mandate:testEmailFirst123`
    );
    expect(await reconciliationRowFor(incoming.id)).toBeUndefined();

    const materializer = new RecurringMaterializeService(
      testDb.db,
      new RuntimeConfigService(),
      rules,
      accounts,
      transactionRepository,
      occurrences,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
    await materializer.materialize();
    const sweep = new RecurringReconciliationSweepService(
      new RuntimeConfigService(),
      transactionRepository,
      reconciliationService,
      NOOP_LOGGER
    );
    await sweep.sweep();

    const page = await transactionRepository.findMany(USER_ID, { limit: 200 });
    const placeholder = page.items.find(
      (item) => item.source === "recurring" && item.recurringRuleId === rule.id
    );
    if (placeholder === undefined) throw new Error("Expected the recurring placeholder.");

    expect(await statusOf(incoming.id)).toBe("posted");
    expect(await statusOf(placeholder.id)).toBe("reversed");
    expect((await reconciliationRowFor(incoming.id))?.status).toBe("auto_matched");
  });

  it("is retry-safe under five parallel reconciliation attempts", async () => {
    const recurringTxn = await postRecurringTransaction(321_000, "Parallel subscription");
    const transactionServiceWithoutHook = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
    const incoming = (
      await transactionServiceWithoutHook.create(
        USER_ID,
        {
          accountId,
          type: "expense",
          amountMinor: 321_000,
          occurredAt: recurringTxn.occurredAt,
          description: "Parallel subscription",
          tags: []
        },
        randomUUID(),
        "api"
      )
    ).transaction;

    await Promise.all(
      Array.from({ length: 5 }, () => reconciliationService.reconcileIncoming(USER_ID, incoming))
    );

    expect(await statusOf(recurringTxn.id)).toBe("reversed");
    const reversalRows = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.reversalOf, recurringTxn.id));
    expect(reversalRows).toHaveLength(1);
    expect(await reconciliationRowFor(incoming.id)).toBeDefined();
  });

  it("system discovery returns the owning tenant for each unreconciled API transaction", async () => {
    const otherUserId = "user-b";
    await insertTestUser(testDb.db, otherUserId);
    const otherAccount = await withTxn(testDb.db, (tx) =>
      accounts.create(
        otherUserId,
        { name: "Other tenant account", type: "bank", openingBalanceMinor: 1_000_000 },
        tx
      )
    );
    const serviceWithoutHook = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
    const own = (
      await serviceWithoutHook.create(
        USER_ID,
        {
          accountId,
          type: "expense",
          amountMinor: 101,
          occurredAt: new Date(),
          description: "Tenant A discovery fixture",
          tags: []
        },
        randomUUID(),
        "api"
      )
    ).transaction;
    const other = (
      await serviceWithoutHook.create(
        otherUserId,
        {
          accountId: otherAccount.id,
          type: "expense",
          amountMinor: 202,
          occurredAt: new Date(),
          description: "Tenant B discovery fixture",
          tags: []
        },
        randomUUID(),
        "api"
      )
    ).transaction;

    const discovered = await transactionRepository.systemFindRecentUnreconciledApiTransactions(
      new Date(Date.now() - 60_000),
      200
    );

    expect(discovered.find((transaction) => transaction.id === own.id)?.userId).toBe(USER_ID);
    expect(discovered.find((transaction) => transaction.id === other.id)?.userId).toBe(otherUserId);
  });

  it("never reconciles a session-authenticated (manual) transaction against a recurring posting", async () => {
    const recurringTxn = await postRecurringTransaction(700_000);

    const manual = await transactionsService.create(
      USER_ID,
      {
        accountId,
        type: "expense",
        amountMinor: 700_000,
        occurredAt: recurringTxn.occurredAt,
        description: "Typed by hand",
        tags: []
      },
      randomUUID(),
      "manual"
    );

    expect(await statusOf(recurringTxn.id)).toBe("posted");
    expect(await reconciliationRowFor(manual.transaction.id)).toBeUndefined();
  });
});

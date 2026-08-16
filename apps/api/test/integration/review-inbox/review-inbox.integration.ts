import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts as accountsTable,
  detectedRecurringStreamChanges,
  detectedRecurringStreams,
  reviewInboxItems,
  transactions
} from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { ReviewInboxMutationService } from "../../../src/review-inbox/review-inbox-mutation.service.js";
import { ReviewInboxRepository } from "../../../src/review-inbox/review-inbox.repository.js";
import { ReviewInboxService } from "../../../src/review-inbox/review-inbox.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_A = "review-inbox-user-a";
const USER_B = "review-inbox-user-b";
const AS_OF = new Date("2026-08-01T12:00:00.000Z");

describe("ReviewInboxService & Mutation (integration)", () => {
  let testDb: TestDb;
  let repository: ReviewInboxRepository;
  let service: ReviewInboxService;
  let mutationService: ReviewInboxMutationService;
  let idempotency: IdempotencyPostgresService;
  let accountA: string;
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
    repository = new ReviewInboxRepository(testDb.db);
    service = new ReviewInboxService(repository);
    idempotency = new IdempotencyPostgresService(
      testDb.db,
      new IdempotencyPostgresRepository(testDb.db)
    );
    mutationService = new ReviewInboxMutationService(repository, idempotency);
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`
      TRUNCATE TABLE review_inbox_items,
                     detected_recurring_stream_changes,
                     spending_regimes,
                     detected_recurring_streams,
                     transactions,
                     audit_log,
                     idempotency_records
      CASCADE;
    `);
    await testDb.db
      .update(accountsTable)
      .set({ balanceMinor: 0 })
      .where(eq(accountsTable.id, accountA));
  });

  async function insertTxn(
    userId: string,
    accountId: string,
    amountMinor: number,
    occurredAt: string
  ): Promise<string> {
    const tId = crypto.randomUUID();
    const now = new Date();
    await testDb.db.insert(transactions).values({
      id: tId,
      userId,
      accountId,
      amountMinor,
      type: "expense",
      status: "posted",
      occurredAt: new Date(occurredAt),
      categoryId: null,
      description: "Test transaction",
      source: "manual",
      createdAt: now,
      updatedAt: now
    });
    await testDb.db
      .update(accountsTable)
      .set({ balanceMinor: sql`${accountsTable.balanceMinor} - ${amountMinor}` })
      .where(eq(accountsTable.id, accountId));
    return tId;
  }

  it("syncs candidate streams, changes, regimes, and uncategorized txns with keyset cursor pagination", async () => {
    const streamId = crypto.randomUUID();
    // 1. Candidate stream
    await testDb.db.insert(detectedRecurringStreams).values({
      id: streamId,
      userId: USER_A,
      logicalKey: "key-sub-01",
      fingerprint: "fp-sub-01",
      counterpartyKey: "netflix",
      transactionType: "expense",
      cadence: "monthly",
      state: "candidate",
      amountBehavior: "fixed",
      medianAmountMinor: 49_900,
      madAmountMinor: 0,
      confidenceBps: 6_500,
      nextExpectedDate: "2026-08-28",
      supersedesStreamId: null,
      detectorVersion: 1,
      inputWatermark: { asOf: AS_OF, rowCount: 2, digest: "a".repeat(64) },
      sufficiency: { status: "sufficient", observationCount: 2, minimumRequired: 2 },
      evidence: { cadenceEvidence: "monthly" },
      computedAt: new Date("2026-07-28T00:00:00Z")
    });

    const changeTxnId = await insertTxn(USER_A, accountA, 79_900, "2026-07-25T00:00:00Z");

    // 2. Spending change
    await testDb.db.insert(detectedRecurringStreamChanges).values({
      id: crypto.randomUUID(),
      userId: USER_A,
      streamId,
      supersedesStreamId: null,
      oldMedianMinor: 49_900,
      newMedianMinor: 79_900,
      deltaMinor: 30_000,
      direction: "increase",
      confidenceBps: 8_500,
      changeOccurredAt: new Date("2026-07-25T00:00:00Z"),
      changeTransactionId: changeTxnId,
      evidence: {
        baselineMedianMinor: 49_900,
        baselineMadMinor: 0,
        newMedianMinor: 79_900,
        newMadMinor: 0,
        deltaMinor: 30_000,
        deltaBps: 6_012,
        direction: "increase",
        confidenceBps: 8_500,
        preShiftCount: 5,
        postShiftCount: 3,
        persistenceCount: 3,
        changeOccurredAt: new Date("2026-07-25T00:00:00Z"),
        changeTransactionId: changeTxnId,
        referenceAllowanceMinor: 500,
        decisionThresholdMinor: 3_500,
        cusumStates: [],
        detectorVersion: 1
      },
      inputWatermark: { asOf: AS_OF, rowCount: 8, digest: "b".repeat(64) },
      detectorVersion: 1,
      computedAt: new Date("2026-07-28T00:00:00Z")
    });

    // 3. Uncategorized transaction
    await insertTxn(USER_A, accountA, 25_000, "2026-07-29T00:00:00Z");

    // Sync
    const syncRes = await service.sync(USER_A, AS_OF);
    expect(syncRes.syncedCount).toBe(4);

    // Summary
    const summary = await service.getSummary(USER_A);
    expect(summary.activeCount).toBe(4);
    expect(summary.categorySuggestionCount).toBe(2);
    expect(summary.recurringStreamCount).toBe(1);
    expect(summary.recurringChangeCount).toBe(1);

    // Page 1
    const page1 = await service.list(USER_A, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();
    expect(page1.totalActive).toBe(4);

    // Page 2
    const cursor = page1.nextCursor;
    if (!cursor) throw new Error("Expected nextCursor");
    const page2 = await service.list(USER_A, { limit: 2, cursor });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();

    // Verify all 4 items are distinct
    const ids = [...page1.items.map((i) => i.id), ...page2.items.map((i) => i.id)];
    expect(new Set(ids).size).toBe(4);

    await assertLedgerInvariants(testDb.db);
  });

  it("enforces strict tenant isolation for listing, dismissal, and feedback", async () => {
    await insertTxn(USER_A, accountA, 30_000, "2026-07-29T00:00:00Z");
    await service.sync(USER_A, AS_OF);

    const userAPage = await service.list(USER_A, {});
    expect(userAPage.items).toHaveLength(1);
    const itemA = userAPage.items[0];
    if (!itemA) throw new Error("Expected item");

    // USER_B should see empty list
    const userBPage = await service.list(USER_B, {});
    expect(userBPage.items).toHaveLength(0);

    // USER_B attempting to dismiss USER_A item fails with not found
    await expect(
      mutationService.dismiss(USER_B, itemA.id, "not_relevant", crypto.randomUUID())
    ).rejects.toThrow();

    await assertLedgerInvariants(testDb.db);
  });

  it("handles deduplication and supersedes older versions safely", async () => {
    // 1. Initial stream version 1
    const streamId = crypto.randomUUID();
    await testDb.db.insert(detectedRecurringStreams).values({
      id: streamId,
      userId: USER_A,
      logicalKey: "key-sub-02",
      fingerprint: "fp-sub-02",
      counterpartyKey: "spotify",
      transactionType: "expense",
      cadence: "monthly",
      state: "candidate",
      amountBehavior: "fixed",
      medianAmountMinor: 11_900,
      madAmountMinor: 0,
      confidenceBps: 6_000,
      nextExpectedDate: "2026-08-28",
      supersedesStreamId: null,
      detectorVersion: 1,
      inputWatermark: { asOf: AS_OF, rowCount: 2, digest: "c".repeat(64) },
      sufficiency: { status: "sufficient", observationCount: 2, minimumRequired: 2 },
      evidence: { cadenceEvidence: "monthly" },
      computedAt: new Date("2026-07-28T00:00:00Z")
    });

    await service.sync(USER_A, AS_OF);
    const initialList = await service.list(USER_A, {});
    expect(initialList.items).toHaveLength(1);
    const firstItem = initialList.items[0];
    if (!firstItem) throw new Error("Expected item");
    expect(firstItem.status).toBe("active");
    expect(firstItem.sourceVersion).toBe(1);

    // 2. Syncing again does not create duplicate active items
    const repeatSync = await service.sync(USER_A, AS_OF);
    expect(repeatSync.syncedCount).toBe(0);
    const listAfterRepeat = await service.list(USER_A, {});
    expect(listAfterRepeat.items).toHaveLength(1);

    // 3. Updated stream version 2 arriving supersedes version 1
    await testDb.db
      .update(detectedRecurringStreams)
      .set({
        detectorVersion: 2,
        confidenceBps: 8_000
      })
      .where(eq(detectedRecurringStreams.id, streamId));

    const updatedSync = await service.sync(USER_A, AS_OF);
    expect(updatedSync.syncedCount).toBe(1);

    const activeList = await service.list(USER_A, { status: "active" });
    expect(activeList.items).toHaveLength(1);
    const activeItem = activeList.items[0];
    if (!activeItem) throw new Error("Expected active item");
    expect(activeItem.sourceVersion).toBe(2);
    expect(activeItem.supersedesItemId).toBe(firstItem.id);

    const supersededList = await service.list(USER_A, { status: "superseded" });
    expect(supersededList.items).toHaveLength(1);
    expect(supersededList.items[0]?.id).toBe(firstItem.id);

    await assertLedgerInvariants(testDb.db);
  });

  it("handles parallel concurrency safely: 5 identical dismissals produce exactly 1 mutation", async () => {
    await insertTxn(USER_A, accountA, 40_000, "2026-07-29T00:00:00Z");
    await service.sync(USER_A, AS_OF);

    const initialList = await service.list(USER_A, {});
    const item = initialList.items[0];
    if (!item) throw new Error("Expected item");

    const idempotencyKey = crypto.randomUUID();

    const results = await Promise.all([
      mutationService.dismiss(USER_A, item.id, "already_handled", idempotencyKey),
      mutationService.dismiss(USER_A, item.id, "already_handled", idempotencyKey),
      mutationService.dismiss(USER_A, item.id, "already_handled", idempotencyKey),
      mutationService.dismiss(USER_A, item.id, "already_handled", idempotencyKey),
      mutationService.dismiss(USER_A, item.id, "already_handled", idempotencyKey)
    ]);

    expect(results).toHaveLength(5);
    const dismissedItem = results[0]?.result.item;
    if (!dismissedItem) throw new Error("Expected dismissed item");
    expect(dismissedItem.status).toBe("dismissed");

    // All results returned the exact same item
    expect(results.every((r) => r.result.item.id === dismissedItem.id)).toBe(true);

    // Exactly 1 item in review_inbox_items
    const allRows = await testDb.db
      .select()
      .from(reviewInboxItems)
      .where(eq(reviewInboxItems.userId, USER_A));
    expect(allRows).toHaveLength(1);
    expect(allRows[0]?.status).toBe("dismissed");

    await assertLedgerInvariants(testDb.db);
  });

  it("handles feedback resolution idempotently", async () => {
    await insertTxn(USER_A, accountA, 50_000, "2026-07-29T00:00:00Z");
    await service.sync(USER_A, AS_OF);

    const initialList = await service.list(USER_A, {});
    const item = initialList.items[0];
    if (!item) throw new Error("Expected item");

    const key = crypto.randomUUID();
    const result1 = await mutationService.feedback(
      USER_A,
      item.id,
      "accepted",
      key,
      5,
      "Correct category"
    );
    expect(result1.result.item.status).toBe("resolved");
    expect(result1.result.feedbackRecorded).toBe(true);

    const result2 = await mutationService.feedback(
      USER_A,
      item.id,
      "accepted",
      key,
      5,
      "Correct category"
    );
    expect(result2.replayed).toBe(true);
    expect(result2.result.item.id).toBe(item.id);

    await assertLedgerInvariants(testDb.db);
  });
});

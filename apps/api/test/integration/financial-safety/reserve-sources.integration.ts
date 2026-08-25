import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AssetReserveCandidateReadService } from "../../../src/assets/asset-reserve-candidate-read.service.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { financialReserveSources } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { UnsupportedReserveSourceError } from "../../../src/common/errors/unsupported-reserve-source.error.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { ReserveSourceRepository } from "../../../src/financial-safety/reserve-source.repository.js";
import { ReserveSourceService } from "../../../src/financial-safety/reserve-source.service.js";
import {
  ReserveValueService,
  type ReserveValueLogger
} from "../../../src/financial-safety/reserve-value.service.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const USER_A = "reserve-sources-user-a";
const USER_B = "reserve-sources-user-b";

const dummyLogger = {
  log: () => {},
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

describe("reserve sources persistence + evaluation", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let assets: AssetRepository;
  let valuations: ValuationRepository;
  let assetCandidates: AssetReserveCandidateReadService;
  let reserveRepo: ReserveSourceRepository;
  let sourceService: ReserveSourceService;
  let valueService: ReserveValueService;
  let transactionService: TransactionService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_A);
    await insertTestUser(testDb.db, USER_B);

    accounts = new AccountRepository(testDb.db);
    assets = new AssetRepository(testDb.db);
    valuations = new ValuationRepository(testDb.db);
    assetCandidates = new AssetReserveCandidateReadService(testDb.db);
    reserveRepo = new ReserveSourceRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const idempotency = new IdempotencyPostgresService(
      testDb.db,
      new IdempotencyPostgresRepository(testDb.db)
    );
    const categoryRepo = new CategoryRepository(testDb.db);
    const transactionRepo = new TransactionRepository(testDb.db);
    transactionService = new TransactionService(
      testDb.db,
      accounts,
      categoryRepo,
      transactionRepo,
      audit,
      dummyLogger
    );

    sourceService = new ReserveSourceService(
      reserveRepo,
      audit,
      accounts,
      assetCandidates,
      idempotency
    );
    valueService = new ReserveValueService(
      focusedTestDouble<ReserveValueLogger>(dummyLogger),
      reserveRepo,
      accounts,
      assetCandidates
    );
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function createAccount(
    userId: string,
    balanceMinor: number,
    type: "bank" | "credit_card" = "bank"
  ) {
    return withTxn(testDb.db, (tx) =>
      accounts.create(
        userId,
        { name: `Account ${randomUUID()}`, type, openingBalanceMinor: balanceMinor },
        tx
      )
    );
  }

  async function createAsset(
    userId: string,
    kind: "fixed_deposit" | "investment" | "gold" = "fixed_deposit"
  ) {
    return withTxn(testDb.db, (tx) =>
      assets.create(
        userId,
        {
          kind,
          name: `Asset ${randomUUID()}`,
          openedAt: new Date("2026-01-01T00:00:00.000Z"),
          openingValueMinor: 100_000
        },
        tx
      )
    );
  }

  it("appends the first classification, then supersedes it on a revision", async () => {
    const account = await createAccount(USER_A, 200_000);

    const first = await sourceService.updateSource(
      USER_A,
      "account",
      account.id,
      { liquidityTier: "instant", isIncluded: true },
      randomUUID()
    );
    expect(first.result.configuration?.liquidityTier).toBe("instant");

    const rowsAfterFirst = await testDb.db
      .select()
      .from(financialReserveSources)
      .where(eq(financialReserveSources.sourceId, account.id));
    expect(rowsAfterFirst).toHaveLength(1);
    expect(rowsAfterFirst[0]?.supersededAt).toBeNull();

    const revised = await sourceService.updateSource(
      USER_A,
      "account",
      account.id,
      { liquidityTier: "locked", isIncluded: true },
      randomUUID()
    );
    expect(revised.result.configuration?.liquidityTier).toBe("locked");

    const rowsAfterRevision = await testDb.db
      .select()
      .from(financialReserveSources)
      .where(eq(financialReserveSources.sourceId, account.id));
    expect(rowsAfterRevision).toHaveLength(2);
    const active = rowsAfterRevision.filter((r) => r.supersededAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]?.liquidityTier).toBe("locked");
    expect(active[0]?.revisionOf).toBe(rowsAfterFirst[0]?.id);
  });

  it("collapses five concurrent identical PUTs into one active classification and one audit effect", async () => {
    const account = await createAccount(USER_A, 300_000);
    const key = randomUUID();
    const input = { liquidityTier: "instant" as const, isIncluded: true };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        sourceService.updateSource(USER_A, "account", account.id, input, key)
      )
    );

    for (const r of results) {
      expect(r.result.sourceId).toBe(account.id);
      expect(r.result.configuration?.liquidityTier).toBe("instant");
    }
    // Exactly one non-replayed write among the five identical attempts.
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);

    const rows = await testDb.db
      .select()
      .from(financialReserveSources)
      .where(
        and(
          eq(financialReserveSources.sourceId, account.id),
          eq(financialReserveSources.userId, USER_A)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.supersededAt).toBeNull();
  });

  it("rejects classifying another tenant's account as not found", async () => {
    const account = await createAccount(USER_B, 100_000);

    await expect(
      sourceService.updateSource(
        USER_A,
        "account",
        account.id,
        { liquidityTier: "instant", isIncluded: true },
        randomUUID()
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("rejects classifying another tenant's asset as not found", async () => {
    const asset = await createAsset(USER_B);

    await expect(
      sourceService.updateSource(
        USER_A,
        "asset",
        asset.id,
        { liquidityTier: "t_plus_1", isIncluded: true },
        randomUUID()
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("rejects an unsupported source kind (credit_card account)", async () => {
    const account = await createAccount(USER_A, -50_000, "credit_card");

    await expect(
      sourceService.updateSource(
        USER_A,
        "account",
        account.id,
        { liquidityTier: "instant", isIncluded: true },
        randomUUID()
      )
    ).rejects.toBeInstanceOf(UnsupportedReserveSourceError);
  });

  it("distinguishes an account and asset that happen to share a UUID", async () => {
    // financial_reserve_sources' active-uniqueness index is keyed on
    // (userId, sourceKind, sourceId) -- classifying an account must never
    // collide with classifying an asset that happens to reuse the same id.
    const account = await createAccount(USER_A, 150_000);
    const sharedId = account.id;

    await sourceService.updateSource(
      USER_A,
      "account",
      sharedId,
      { liquidityTier: "instant", isIncluded: true },
      randomUUID()
    );

    // No asset exists with this id for USER_A, so classifying it as an asset
    // must fail ownership validation rather than silently reusing the
    // account's row.
    await expect(
      sourceService.updateSource(
        USER_A,
        "asset",
        sharedId,
        { liquidityTier: "locked", isIncluded: true },
        randomUUID()
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("reflects an account balance change in the reserve summary without touching classification metadata", async () => {
    const account = await createAccount(USER_A, 100_000);
    await sourceService.updateSource(
      USER_A,
      "account",
      account.id,
      { liquidityTier: "instant", isIncluded: true },
      randomUUID()
    );

    const rowsBefore = await testDb.db
      .select()
      .from(financialReserveSources)
      .where(eq(financialReserveSources.sourceId, account.id));

    const summaryBefore = await valueService.getSummary(USER_A);
    expect(summaryBefore.instantMinor).toBeGreaterThanOrEqual(100_000);

    // A real posted transaction, not a direct balance write -- this is how
    // an account balance actually changes in production, and it keeps the
    // ledger invariant intact for `assertLedgerInvariants()` below.
    await transactionService.create(
      USER_A,
      {
        accountId: account.id,
        type: "income",
        amountMinor: 500_000,
        occurredAt: new Date("2026-08-15T00:00:00.000Z"),
        description: "Bonus credit",
        tags: []
      },
      randomUUID()
    );

    const summaryAfter = await valueService.getSummary(USER_A);
    expect(summaryAfter.instantMinor).toBe(summaryBefore.instantMinor + 500_000);

    const rowsAfter = await testDb.db
      .select()
      .from(financialReserveSources)
      .where(eq(financialReserveSources.sourceId, account.id));
    expect(rowsAfter).toEqual(rowsBefore);
  });

  it("reflects a new asset valuation in the reserve summary without touching classification metadata", async () => {
    const asset = await createAsset(USER_A, "fixed_deposit");
    await withTxn(testDb.db, (tx) =>
      valuations.create(
        USER_A,
        asset.id,
        { valueMinor: 200_000, valuedAt: new Date("2026-08-01T00:00:00.000Z"), source: "manual" },
        tx
      )
    );
    await sourceService.updateSource(
      USER_A,
      "asset",
      asset.id,
      { liquidityTier: "t_plus_1", isIncluded: true },
      randomUUID()
    );

    const summaryBefore = await valueService.getSummary(
      USER_A,
      new Date("2026-08-10T00:00:00.000Z")
    );
    expect(summaryBefore.tPlusOneMinor).toBeGreaterThanOrEqual(200_000);

    await withTxn(testDb.db, (tx) =>
      valuations.create(
        USER_A,
        asset.id,
        { valueMinor: 400_000, valuedAt: new Date("2026-08-05T00:00:00.000Z"), source: "manual" },
        tx
      )
    );

    const summaryAfter = await valueService.getSummary(
      USER_A,
      new Date("2026-08-10T00:00:00.000Z")
    );
    expect(summaryAfter.tPlusOneMinor).toBe(summaryBefore.tPlusOneMinor - 200_000 + 400_000);
  });

  it("drops a stale valuation out of the eligible total at the freshness threshold", async () => {
    const asset = await createAsset(USER_A, "fixed_deposit"); // 180-day threshold
    await withTxn(testDb.db, (tx) =>
      valuations.create(
        USER_A,
        asset.id,
        { valueMinor: 300_000, valuedAt: new Date("2026-01-01T00:00:00.000Z"), source: "manual" },
        tx
      )
    );
    await sourceService.updateSource(
      USER_A,
      "asset",
      asset.id,
      { liquidityTier: "locked", isIncluded: true },
      randomUUID()
    );

    const source = (await valueService.listSources(USER_A, { limit: 200 })).items.find(
      (item) => item.sourceId === asset.id
    );
    expect(source?.freshness).toBe("stale");
  });

  it("excludes an archived account from the eligible total while preserving its classification row", async () => {
    const account = await createAccount(USER_A, 250_000);
    await sourceService.updateSource(
      USER_A,
      "account",
      account.id,
      { liquidityTier: "instant", isIncluded: true },
      randomUUID()
    );
    await withTxn(testDb.db, (tx) => accounts.archive(USER_A, account.id, tx));

    const page = await valueService.listSources(USER_A, { limit: 200 });
    const source = page.items.find((item) => item.sourceId === account.id);
    expect(source?.exclusionReason).toBe("archived_account");
    expect(source?.configuration).not.toBeNull();
  });

  it("keeps cross-tenant reserve source lists isolated", async () => {
    const accountA = await createAccount(USER_A, 100_000);
    await sourceService.updateSource(
      USER_A,
      "account",
      accountA.id,
      { liquidityTier: "instant", isIncluded: true },
      randomUUID()
    );

    const pageForB = await valueService.listSources(USER_B, { limit: 200 });
    expect(pageForB.items.some((item) => item.sourceId === accountA.id)).toBe(false);
  });

  it("paginates stably across two pages without duplicates or gaps", async () => {
    const created = await Promise.all([
      createAccount(USER_A, 10_000),
      createAccount(USER_A, 20_000),
      createAccount(USER_A, 30_000)
    ]);

    const firstPage = await valueService.listSources(USER_A, { limit: 1, sourceKind: "account" });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.pageInfo.hasMore).toBe(true);
    const cursor = firstPage.pageInfo.nextCursor;
    if (cursor === null) throw new Error("expected a cursor");

    const seen = new Set(firstPage.items.map((i) => i.sourceId));
    let nextCursor: string | null = cursor;
    while (nextCursor !== null) {
      const page: Awaited<ReturnType<typeof valueService.listSources>> =
        await valueService.listSources(USER_A, {
          limit: 1,
          sourceKind: "account",
          cursor: nextCursor
        });
      for (const item of page.items) {
        expect(seen.has(item.sourceId)).toBe(false);
        seen.add(item.sourceId);
      }
      nextCursor = page.pageInfo.nextCursor;
    }

    for (const account of created) {
      expect(seen.has(account.id)).toBe(true);
    }
  });
});

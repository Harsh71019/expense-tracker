import { describe, expect, it, vi } from "vitest";

import { AccountRepository } from "../accounts/account.repository.js";
import { AssetRepository } from "../assets/asset.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { DashboardRepository } from "../dashboard/dashboard.repository.js";
import { ImportBatchRepository } from "../imports/import-batch.repository.js";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository.js";
import { MonthlyRollupRepository } from "../reports/monthly-rollup.repository.js";
import { UserProfileRepository } from "../user-profiles/user-profile.repository.js";
import { createMockDrizzleDb } from "./mock-drizzle.js";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const SECOND_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const MAPPING = {
  date: "Date",
  amount: "Amount",
  description: "Description",
  dateFormat: "YYYY-MM-DD" as const,
  amountConvention: "single_signed" as const
};

function sequentialSelectDb(results: readonly unknown[][]) {
  const db = createMockDrizzleDb();
  const select = vi.fn();
  db.select = select;
  for (const rows of results) {
    select.mockReturnValueOnce(createMockDrizzleDb(rows));
  }
  return db;
}

describe("repository edge branches", () => {
  it("covers dashboard empty and sparse historical aggregation paths", async () => {
    const empty = new DashboardRepository(createMockDrizzleDb());
    await expect(empty.accountsBalanceMinorAsOf("u1", NOW)).resolves.toBe(0);
    await expect(empty.assetsValueMinorAsOf("u1", NOW)).resolves.toBe(0);

    const accountDb = sequentialSelectDb([[{ id: ID, openingBalanceMinor: 5_000 }], []]);
    await expect(
      new DashboardRepository(accountDb).accountsBalanceMinorAsOf("u1", NOW)
    ).resolves.toBe(5_000);

    const assetDb = sequentialSelectDb([
      [{ id: ID }, { id: SECOND_ID }],
      [
        { assetId: ID, valueMinor: 10_000 },
        { assetId: ID, valueMinor: 9_000 },
        { assetId: SECOND_ID, valueMinor: 5_000 }
      ]
    ]);
    await expect(new DashboardRepository(assetDb).assetsValueMinorAsOf("u1", NOW)).resolves.toBe(
      15_000
    );
  });

  it("omits null category ids from dashboard totals", async () => {
    const db = createMockDrizzleDb([
      { categoryId: null, spentMinor: "100", incomeMinor: "20", txnCount: 2 }
    ]);
    await expect(new DashboardRepository(db).categoryTotals("u1", NOW, NOW)).resolves.toEqual([
      { spentMinor: 100, incomeMinor: 20, txnCount: 2 }
    ]);
  });

  it("covers monthly rollup null-category and missing-total fallbacks", async () => {
    const db = sequentialSelectDb([
      [{ categoryId: null, spentMinor: "100", incomeMinor: "20", txnCount: 2 }],
      [{ accountId: ID, netMinor: "-80" }],
      []
    ]);
    await expect(new MonthlyRollupRepository(db).recompute("u1", "2026-07")).resolves.toMatchObject(
      {
        byCategory: [{ spentMinor: 100, incomeMinor: 20, txnCount: 2 }],
        totalExpenseMinor: 0,
        totalIncomeMinor: 0
      }
    );
    await expect(
      new MonthlyRollupRepository(createMockDrizzleDb()).findByMonth("u1", "2026-07")
    ).resolves.toBeNull();
  });

  it("covers every missing import-batch row branch", async () => {
    const db = createMockDrizzleDb();
    const repository = new ImportBatchRepository(db);
    await expect(repository.create("u1", ID, "rows.csv", "hash", MAPPING)).rejects.toThrow(
      "Import batch insert did not return a row."
    );
    await expect(repository.findById("u1", ID)).resolves.toBeNull();
    await expect(repository.findByFileHash("u1", "hash")).resolves.toBeNull();
    await expect(repository.findLatestMappingForAccount("u1", ID)).resolves.toBeNull();
  });

  it("covers missing account, category, and asset rows", async () => {
    const accountDb = createMockDrizzleDb();
    const accounts = new AccountRepository(accountDb);
    await expect(
      accounts.create(
        "u1",
        { name: "Bank", type: "bank", openingBalanceMinor: 0 },
        // @ts-expect-error - fluent transaction double.
        accountDb
      )
    ).rejects.toThrow("Account insert did not return a row.");
    await expect(
      accounts.findById(
        "u1",
        ID,
        // @ts-expect-error - fluent transaction double.
        accountDb
      )
    ).resolves.toBeNull();

    const categoryDb = createMockDrizzleDb();
    const categories = new CategoryRepository(categoryDb);
    await expect(
      categories.create(
        "u1",
        { name: "Food", kind: "expense" },
        // @ts-expect-error - fluent transaction double.
        categoryDb
      )
    ).rejects.toThrow("Category insert did not return a row.");
    await expect(categories.findActiveById("u1", ID)).resolves.toBeNull();
    await expect(categories.updateGroup("u1", ID, { group: null })).resolves.toBeNull();

    const assetDb = createMockDrizzleDb();
    const assets = new AssetRepository(assetDb);
    await expect(
      assets.create(
        "u1",
        {
          kind: "investment",
          name: "Fund",
          openedAt: NOW,
          openingValueMinor: 0
        },
        // @ts-expect-error - fluent transaction double.
        assetDb
      )
    ).rejects.toThrow("Asset insert did not return a row.");
    await expect(
      assets.findOpenById(
        "u1",
        ID,
        // @ts-expect-error - fluent transaction double.
        assetDb
      )
    ).resolves.toBeNull();
  });

  it("covers notification validation, missing rows, and insert failure", async () => {
    const db = createMockDrizzleDb();
    const repository = new NotificationOutboxRepository(db);
    await expect(
      repository.enqueue(
        "u1",
        "balance_drift",
        {},
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).rejects.toThrow("Notification outbox insert did not return a row.");
    await expect(repository.findById("not-a-uuid")).resolves.toBeNull();
    await expect(repository.findById(ID)).resolves.toBeNull();
  });

  it("covers missing user profiles, failed ensure, and lost update", async () => {
    const db = createMockDrizzleDb();
    const repository = new UserProfileRepository(db);
    await expect(repository.findByUserId("u1")).resolves.toBeNull();
    await expect(repository.ensure("u1", "User")).rejects.toThrow("was not persisted");
    await expect(repository.update("u1", { displayName: "Updated" })).resolves.toBeNull();
  });
});

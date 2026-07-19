import { formatMinorInput } from "@vyaya/shared";

import type { components } from "@/lib/api/generated/schema";
import { MOCK_USER_ID } from "@/mocks/enabled";

import { createIdGenerator } from "./ids";

export type AccountDto = components["schemas"]["Account"];
export type CategoryDto = components["schemas"]["Category"];
export type CategoryRuleDto = components["schemas"]["CategoryRule"];
export type TransactionDto = components["schemas"]["Transaction"];
export type AssetDto = components["schemas"]["Asset"];
export type ValuationDto = components["schemas"]["Valuation"];
export type ImportBatchDto = components["schemas"]["ImportBatch"];
export type StagedRowDto = components["schemas"]["StagedRow"];
export type MonthlyRollupDto = components["schemas"]["MonthlyRollup"];
export type UserProfileDto = components["schemas"]["UserProfile"];
export type TransferDto = components["schemas"]["Transfer"];
export type TransferReversalDto = components["schemas"]["TransferReversal"];
export type RecurringRuleDto = components["schemas"]["RecurringRule"];
/** Generated-schema shape, distinct from `@vyaya/shared`'s `ColumnMapping` — see toColumnMappingDto in handlers/imports.ts. */
export type ColumnMappingDto = ImportBatchDto["mapping"];

/**
 * Idempotency-Key -> prior response, one map per endpoint shape. Kept as
 * separate typed maps (rather than one `Map<string, unknown>`) so replays
 * don't need an `as` cast to read back out, per AGENTS.md's no-`as` rule.
 */
export interface MockIdempotency {
  accounts: Map<string, AccountDto>;
  accountArchive: Set<string>;
  categories: Map<string, CategoryDto>;
  categoryArchive: Set<string>;
  categoryRules: Map<string, CategoryRuleDto>;
  categoryRuleDelete: Set<string>;
  transactions: Map<string, TransactionDto>;
  transfers: Map<string, TransferDto>;
  assets: Map<string, AssetDto>;
  assetClose: Set<string>;
  valuations: Map<string, ValuationDto>;
  recurringRules: Map<string, RecurringRuleDto>;
}

export interface MockStore {
  accounts: AccountDto[];
  categories: CategoryDto[];
  categoryRules: CategoryRuleDto[];
  transactions: TransactionDto[];
  assets: AssetDto[];
  valuations: ValuationDto[];
  importBatches: ImportBatchDto[];
  stagedRows: StagedRowDto[];
  monthlyRollups: MonthlyRollupDto[];
  recurringRules: RecurringRuleDto[];
  profile: UserProfileDto;
  /** accountId -> the mapping last used for a successful import to that account. */
  savedMappings: Map<string, ColumnMappingDto>;
  /** batchId -> ids of the transactions created by committing that batch (mock-internal only, not part of any DTO). */
  committedBatchTransactionIds: Map<string, string[]>;
  idempotency: MockIdempotency;
  nextAccountId: () => string;
  nextCategoryId: () => string;
  nextCategoryRuleId: () => string;
  nextTransactionId: () => string;
  nextTransferGroupId: () => string;
  nextAssetId: () => string;
  nextValuationId: () => string;
  nextImportBatchId: () => string;
  nextStagedRowId: () => string;
  nextRecurringRuleId: () => string;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function findAccount(store: MockStore, accountId: string): AccountDto | undefined {
  return store.accounts.find((account) => account.id === accountId);
}

export function findCategory(store: MockStore, categoryId: string): CategoryDto | undefined {
  return store.categories.find((category) => category.id === categoryId);
}

export function findAsset(store: MockStore, assetId: string): AssetDto | undefined {
  return store.assets.find((asset) => asset.id === assetId);
}

export function findTransaction(
  store: MockStore,
  transactionId: string
): TransactionDto | undefined {
  return store.transactions.find((transaction) => transaction.id === transactionId);
}

export function findImportBatch(store: MockStore, batchId: string): ImportBatchDto | undefined {
  return store.importBatches.find((batch) => batch.id === batchId);
}

export function findMonthlyRollup(store: MockStore, month: string): MonthlyRollupDto | undefined {
  return store.monthlyRollups.find((rollup) => rollup.month === month);
}

/** Mirrors apps/api transaction-mutation.service.ts: income adds, expense subtracts. */
export function applyBalanceDelta(store: MockStore, accountId: string, deltaMinor: number): void {
  const account = findAccount(store, accountId);
  if (account !== undefined) {
    account.balanceMinor += deltaMinor;
    account.updatedAt = new Date().toISOString();
  }
}

export function latestValuation(store: MockStore, assetId: string): ValuationDto | undefined {
  return store.valuations
    .filter((valuation) => valuation.assetId === assetId)
    .sort((a, b) => (b.valuedAt ?? "").localeCompare(a.valuedAt ?? ""))[0];
}

const TXN_TEMPLATES: ReadonlyArray<{
  daysAgo: number;
  accountName: string;
  categoryName: string | null;
  type: "income" | "expense";
  amountMinor: number;
  description: string;
  tags: readonly string[];
}> = [
  // Month 1 (0-30 days)
  {
    daysAgo: 28,
    accountName: "HDFC Bank",
    categoryName: "Salary",
    type: "income",
    amountMinor: 100_000_00,
    description: "Monthly salary",
    tags: ["salary", "recurring"]
  },
  {
    daysAgo: 27,
    accountName: "HDFC Bank",
    categoryName: "Rent",
    type: "expense",
    amountMinor: 20_000_00,
    description: "Flat rent payment",
    tags: ["rent", "recurring"]
  },
  {
    daysAgo: 26,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 1_250_00,
    description: "BigBasket groceries",
    tags: ["groceries"]
  },
  {
    daysAgo: 25,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 425_00,
    description: "SWIGGY order",
    tags: ["food"]
  },
  {
    daysAgo: 24,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 128_00,
    description: "UBER ride to office",
    tags: []
  },
  {
    daysAgo: 23,
    accountName: "HDFC Bank",
    categoryName: "Utilities",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Electricity bill",
    tags: ["utilities", "recurring"]
  },
  {
    daysAgo: 22,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 21,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 2_499_00,
    description: "AMAZON electronics order",
    tags: ["shopping"]
  },
  {
    daysAgo: 20,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 85_00,
    description: "Chai and samosa",
    tags: []
  },
  {
    daysAgo: 19,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 199_00,
    description: "NETFLIX subscription",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 18,
    accountName: "SBI Savings",
    categoryName: "Bonus",
    type: "income",
    amountMinor: 25_000_00,
    description: "Performance bonus",
    tags: ["bonus"]
  },
  {
    daysAgo: 17,
    accountName: "Paytm Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 800_00,
    description: "Movie tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 16,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 890_50,
    description: "Reliance Trends shopping",
    tags: ["groceries"]
  },
  {
    daysAgo: 15,
    accountName: "ICICI Credit Card",
    categoryName: "Health",
    type: "expense",
    amountMinor: 1_500_00,
    description: "Gym membership",
    tags: ["health", "recurring"]
  },
  {
    daysAgo: 14,
    accountName: "HDFC Bank",
    categoryName: "Travel",
    type: "expense",
    amountMinor: 2_500_00,
    description: "IRCTC train ticket",
    tags: ["travel"]
  },
  {
    daysAgo: 13,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "ZOMATO order lunch",
    tags: ["food"]
  },
  {
    daysAgo: 12,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 800_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 11,
    accountName: "SBI Savings",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 149_00,
    description: "SPOTIFY premium",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 10,
    accountName: "Cash Wallet",
    categoryName: "Education",
    type: "expense",
    amountMinor: 1_500_00,
    description: "Online course fee",
    tags: ["education"]
  },
  {
    daysAgo: 9,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Croma electronics",
    tags: ["shopping"]
  },
  {
    daysAgo: 8,
    accountName: "Paytm Wallet",
    categoryName: "Insurance",
    type: "expense",
    amountMinor: 3_500_00,
    description: "LIC insurance premium",
    tags: ["insurance", "recurring"]
  },
  {
    daysAgo: 7,
    accountName: "HDFC Bank",
    categoryName: "Health",
    type: "expense",
    amountMinor: 650_00,
    description: "Pharmacy medicines",
    tags: ["health"]
  },
  {
    daysAgo: 6,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 400_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 5,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 750_00,
    description: "Local market vegetables",
    tags: ["groceries"]
  },
  {
    daysAgo: 4,
    accountName: "HDFC Bank",
    categoryName: "Interest",
    type: "income",
    amountMinor: 250_00,
    description: "Savings account interest",
    tags: []
  },
  {
    daysAgo: 3,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 95_00,
    description: "OLA ride to airport",
    tags: []
  },
  {
    daysAgo: 2,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 280_00,
    description: "SWIGGY order dinner",
    tags: ["food"]
  },
  {
    daysAgo: 1,
    accountName: "HDFC Bank",
    categoryName: null,
    type: "expense",
    amountMinor: 300_00,
    description: "ATM withdrawal",
    tags: []
  },

  // Month 2 (31-60 days)
  {
    daysAgo: 58,
    accountName: "HDFC Bank",
    categoryName: "Salary",
    type: "income",
    amountMinor: 100_000_00,
    description: "Monthly salary",
    tags: ["salary", "recurring"]
  },
  {
    daysAgo: 57,
    accountName: "HDFC Bank",
    categoryName: "Rent",
    type: "expense",
    amountMinor: 20_000_00,
    description: "Flat rent payment",
    tags: ["rent", "recurring"]
  },
  {
    daysAgo: 56,
    accountName: "SBI Savings",
    categoryName: "Dividends",
    type: "income",
    amountMinor: 5_000_00,
    description: "Dividend payment",
    tags: ["dividends"]
  },
  {
    daysAgo: 55,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 54,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 1_100_00,
    description: "BigBasket grocery delivery",
    tags: ["groceries"]
  },
  {
    daysAgo: 53,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 3_500_00,
    description: "Reliance Trends shopping",
    tags: ["shopping"]
  },
  {
    daysAgo: 52,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 150_00,
    description: "UBER ride",
    tags: []
  },
  {
    daysAgo: 51,
    accountName: "HDFC Bank",
    categoryName: "Utilities",
    type: "expense",
    amountMinor: 1_800_00,
    description: "Broadband bill",
    tags: ["utilities", "recurring"]
  },
  {
    daysAgo: 50,
    accountName: "Cash Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Concert tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 49,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 1_000_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 48,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 450_00,
    description: "SWIGGY order",
    tags: ["food"]
  },
  {
    daysAgo: 47,
    accountName: "SBI Savings",
    categoryName: "Health",
    type: "expense",
    amountMinor: 2_000_00,
    description: "Doctor checkup and tests",
    tags: ["health"]
  },
  {
    daysAgo: 46,
    accountName: "Cash Wallet",
    categoryName: "Gifts",
    type: "expense",
    amountMinor: 1_500_00,
    description: "Birthday gift purchase",
    tags: ["gifts"]
  },
  {
    daysAgo: 45,
    accountName: "Paytm Wallet",
    categoryName: "Travel",
    type: "expense",
    amountMinor: 1_800_00,
    description: "Flight booking",
    tags: ["travel"]
  },
  {
    daysAgo: 44,
    accountName: "HDFC Bank",
    categoryName: "Education",
    type: "expense",
    amountMinor: 2_000_00,
    description: "Workshop registration",
    tags: ["education"]
  },
  {
    daysAgo: 43,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 42,
    accountName: "Cash Wallet",
    categoryName: null,
    type: "expense",
    amountMinor: 500_00,
    description: "Miscellaneous expense",
    tags: []
  },
  {
    daysAgo: 41,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 899_00,
    description: "AMAZON purchase",
    tags: ["shopping"]
  },
  {
    daysAgo: 40,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 120_00,
    description: "Uber ride",
    tags: []
  },
  {
    daysAgo: 39,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 199_00,
    description: "NETFLIX subscription",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 38,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 200_00,
    description: "Tea and snacks",
    tags: []
  },
  {
    daysAgo: 37,
    accountName: "SBI Savings",
    categoryName: "Freelance",
    type: "income",
    amountMinor: 8_000_00,
    description: "Freelance web design",
    tags: ["freelance"]
  },
  {
    daysAgo: 36,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 35,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 950_00,
    description: "Local market shopping",
    tags: ["groceries"]
  },
  {
    daysAgo: 34,
    accountName: "Paytm Wallet",
    categoryName: "Health",
    type: "expense",
    amountMinor: 500_00,
    description: "Pharmacy medicines",
    tags: ["health"]
  },
  {
    daysAgo: 33,
    accountName: "ICICI Credit Card",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 600_00,
    description: "Movie tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 32,
    accountName: "HDFC Bank",
    categoryName: "Interest",
    type: "income",
    amountMinor: 280_00,
    description: "Savings account interest",
    tags: []
  },
  {
    daysAgo: 31,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 320_00,
    description: "ZOMATO order",
    tags: ["food"]
  },

  // Month 3 (61-90 days)
  {
    daysAgo: 88,
    accountName: "HDFC Bank",
    categoryName: "Salary",
    type: "income",
    amountMinor: 100_000_00,
    description: "Monthly salary",
    tags: ["salary", "recurring"]
  },
  {
    daysAgo: 87,
    accountName: "HDFC Bank",
    categoryName: "Rent",
    type: "expense",
    amountMinor: 20_000_00,
    description: "Flat rent payment",
    tags: ["rent", "recurring"]
  },
  {
    daysAgo: 86,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 85,
    accountName: "SBI Savings",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 1_300_00,
    description: "BigBasket grocery order",
    tags: ["groceries"]
  },
  {
    daysAgo: 84,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 180_00,
    description: "OLA ride",
    tags: []
  },
  {
    daysAgo: 83,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 2_200_00,
    description: "Croma electronics",
    tags: ["shopping"]
  },
  {
    daysAgo: 82,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 250_00,
    description: "Street food",
    tags: []
  },
  {
    daysAgo: 81,
    accountName: "HDFC Bank",
    categoryName: "Utilities",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Electricity bill",
    tags: ["utilities", "recurring"]
  },
  {
    daysAgo: 80,
    accountName: "Cash Wallet",
    categoryName: "Health",
    type: "expense",
    amountMinor: 750_00,
    description: "Doctor consultation",
    tags: ["health"]
  },
  {
    daysAgo: 79,
    accountName: "Paytm Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 700_00,
    description: "Movie tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 78,
    accountName: "SBI Savings",
    categoryName: "Travel",
    type: "expense",
    amountMinor: 3_500_00,
    description: "Hotel booking",
    tags: ["travel"]
  },
  {
    daysAgo: 77,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 380_00,
    description: "SWIGGY order",
    tags: ["food"]
  },
  {
    daysAgo: 76,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 75,
    accountName: "Cash Wallet",
    categoryName: "Gifts",
    type: "expense",
    amountMinor: 800_00,
    description: "Wedding gift",
    tags: ["gifts"]
  },
  {
    daysAgo: 74,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 199_00,
    description: "NETFLIX subscription",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 73,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 72,
    accountName: "ICICI Credit Card",
    categoryName: "Insurance",
    type: "expense",
    amountMinor: 2_500_00,
    description: "Health insurance premium",
    tags: ["insurance"]
  },
  {
    daysAgo: 71,
    accountName: "SBI Savings",
    categoryName: "Education",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Online course purchase",
    tags: ["education"]
  },
  {
    daysAgo: 70,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 180_00,
    description: "Coffee and pastry",
    tags: []
  },
  {
    daysAgo: 69,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 110_00,
    description: "Uber ride",
    tags: []
  },
  {
    daysAgo: 68,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 67,
    accountName: "HDFC Bank",
    categoryName: "Interest",
    type: "income",
    amountMinor: 310_00,
    description: "Savings account interest",
    tags: []
  },
  {
    daysAgo: 66,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 820_00,
    description: "Local market shopping",
    tags: ["groceries"]
  },
  {
    daysAgo: 65,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 1_499_00,
    description: "AMAZON purchase",
    tags: ["shopping"]
  },
  {
    daysAgo: 64,
    accountName: "SBI Savings",
    categoryName: "Health",
    type: "expense",
    amountMinor: 600_00,
    description: "Pharmacy medicines",
    tags: ["health"]
  },
  {
    daysAgo: 63,
    accountName: "Paytm Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 800_00,
    description: "Concert tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 62,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 220_00,
    description: "ZOMATO delivery",
    tags: ["food"]
  },
  {
    daysAgo: 61,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 149_00,
    description: "SPOTIFY premium",
    tags: ["subscriptions"]
  },

  // Month 4 (91-120 days)
  {
    daysAgo: 118,
    accountName: "HDFC Bank",
    categoryName: "Salary",
    type: "income",
    amountMinor: 100_000_00,
    description: "Monthly salary",
    tags: ["salary", "recurring"]
  },
  {
    daysAgo: 117,
    accountName: "HDFC Bank",
    categoryName: "Rent",
    type: "expense",
    amountMinor: 20_000_00,
    description: "Flat rent payment",
    tags: ["rent", "recurring"]
  },
  {
    daysAgo: 116,
    accountName: "SBI Savings",
    categoryName: "Bonus",
    type: "income",
    amountMinor: 15_000_00,
    description: "Mid-quarter bonus",
    tags: ["bonus"]
  },
  {
    daysAgo: 115,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 114,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 1_100_00,
    description: "BigBasket grocery order",
    tags: ["groceries"]
  },
  {
    daysAgo: 113,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 145_00,
    description: "OLA ride",
    tags: []
  },
  {
    daysAgo: 112,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 2_800_00,
    description: "Reliance Trends shopping",
    tags: ["shopping"]
  },
  {
    daysAgo: 111,
    accountName: "HDFC Bank",
    categoryName: "Utilities",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Electricity bill",
    tags: ["utilities", "recurring"]
  },
  {
    daysAgo: 110,
    accountName: "Cash Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 1_000_00,
    description: "Movie tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 109,
    accountName: "SBI Savings",
    categoryName: "Travel",
    type: "expense",
    amountMinor: 2_800_00,
    description: "Train ticket booking",
    tags: ["travel"]
  },
  {
    daysAgo: 108,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 900_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 107,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 420_00,
    description: "SWIGGY order",
    tags: ["food"]
  },
  {
    daysAgo: 106,
    accountName: "Cash Wallet",
    categoryName: "Health",
    type: "expense",
    amountMinor: 800_00,
    description: "Doctor visit and medicines",
    tags: ["health"]
  },
  {
    daysAgo: 105,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 104,
    accountName: "HDFC Bank",
    categoryName: "Education",
    type: "expense",
    amountMinor: 2_500_00,
    description: "Course certification",
    tags: ["education"]
  },
  {
    daysAgo: 103,
    accountName: "Paytm Wallet",
    categoryName: "Insurance",
    type: "expense",
    amountMinor: 3_500_00,
    description: "LIC insurance premium",
    tags: ["insurance", "recurring"]
  },
  {
    daysAgo: 102,
    accountName: "Cash Wallet",
    categoryName: "Gifts",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Anniversary gift",
    tags: ["gifts"]
  },
  {
    daysAgo: 101,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 1_799_00,
    description: "AMAZON purchase",
    tags: ["shopping"]
  },
  {
    daysAgo: 100,
    accountName: "SBI Savings",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 300_00,
    description: "ZOMATO delivery",
    tags: ["food"]
  },
  {
    daysAgo: 99,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 199_00,
    description: "NETFLIX subscription",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 98,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 150_00,
    description: "Tea and snacks",
    tags: []
  },
  {
    daysAgo: 97,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 135_00,
    description: "Uber ride",
    tags: []
  },
  {
    daysAgo: 96,
    accountName: "HDFC Bank",
    categoryName: "Interest",
    type: "income",
    amountMinor: 340_00,
    description: "Savings account interest",
    tags: []
  },
  {
    daysAgo: 95,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 94,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 750_00,
    description: "Local market shopping",
    tags: ["groceries"]
  },
  {
    daysAgo: 93,
    accountName: "ICICI Credit Card",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 550_00,
    description: "Movie and dinner",
    tags: ["entertainment"]
  },
  {
    daysAgo: 92,
    accountName: "SBI Savings",
    categoryName: "Health",
    type: "expense",
    amountMinor: 700_00,
    description: "Pharmacy medicines",
    tags: ["health"]
  },
  {
    daysAgo: 91,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 1_100_00,
    description: "Petrol refill",
    tags: []
  },

  // Month 5 (121-150 days)
  {
    daysAgo: 148,
    accountName: "HDFC Bank",
    categoryName: "Salary",
    type: "income",
    amountMinor: 100_000_00,
    description: "Monthly salary",
    tags: ["salary", "recurring"]
  },
  {
    daysAgo: 147,
    accountName: "HDFC Bank",
    categoryName: "Rent",
    type: "expense",
    amountMinor: 20_000_00,
    description: "Flat rent payment",
    tags: ["rent", "recurring"]
  },
  {
    daysAgo: 146,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 145,
    accountName: "SBI Savings",
    categoryName: "Dividends",
    type: "income",
    amountMinor: 8_000_00,
    description: "Dividend payment",
    tags: ["dividends"]
  },
  {
    daysAgo: 144,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 1_250_00,
    description: "BigBasket grocery order",
    tags: ["groceries"]
  },
  {
    daysAgo: 143,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 170_00,
    description: "OLA ride",
    tags: []
  },
  {
    daysAgo: 142,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 2_100_00,
    description: "Croma electronics",
    tags: ["shopping"]
  },
  {
    daysAgo: 141,
    accountName: "HDFC Bank",
    categoryName: "Utilities",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Electricity bill",
    tags: ["utilities", "recurring"]
  },
  {
    daysAgo: 140,
    accountName: "Cash Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 900_00,
    description: "Theater tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 139,
    accountName: "SBI Savings",
    categoryName: "Travel",
    type: "expense",
    amountMinor: 4_200_00,
    description: "Flight booking",
    tags: ["travel"]
  },
  {
    daysAgo: 138,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 950_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 137,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 400_00,
    description: "SWIGGY order",
    tags: ["food"]
  },
  {
    daysAgo: 136,
    accountName: "Cash Wallet",
    categoryName: "Health",
    type: "expense",
    amountMinor: 650_00,
    description: "Dental checkup",
    tags: ["health"]
  },
  {
    daysAgo: 135,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 134,
    accountName: "HDFC Bank",
    categoryName: "Education",
    type: "expense",
    amountMinor: 1_800_00,
    description: "Workshop registration",
    tags: ["education"]
  },
  {
    daysAgo: 133,
    accountName: "Paytm Wallet",
    categoryName: "Insurance",
    type: "expense",
    amountMinor: 2_000_00,
    description: "Car insurance premium",
    tags: ["insurance"]
  },
  {
    daysAgo: 132,
    accountName: "Cash Wallet",
    categoryName: "Gifts",
    type: "expense",
    amountMinor: 2_000_00,
    description: "Wedding gift purchase",
    tags: ["gifts"]
  },
  {
    daysAgo: 131,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 1_600_00,
    description: "AMAZON purchase",
    tags: ["shopping"]
  },
  {
    daysAgo: 130,
    accountName: "SBI Savings",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 280_00,
    description: "ZOMATO delivery",
    tags: ["food"]
  },
  {
    daysAgo: 129,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 199_00,
    description: "NETFLIX subscription",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 128,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 120_00,
    description: "Coffee break",
    tags: []
  },
  {
    daysAgo: 127,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 155_00,
    description: "Uber ride",
    tags: []
  },
  {
    daysAgo: 126,
    accountName: "HDFC Bank",
    categoryName: "Interest",
    type: "income",
    amountMinor: 380_00,
    description: "Savings account interest",
    tags: []
  },
  {
    daysAgo: 125,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 124,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 900_00,
    description: "Local market shopping",
    tags: ["groceries"]
  },
  {
    daysAgo: 123,
    accountName: "ICICI Credit Card",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 800_00,
    description: "Concert tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 122,
    accountName: "SBI Savings",
    categoryName: "Health",
    type: "expense",
    amountMinor: 550_00,
    description: "Pharmacy medicines",
    tags: ["health"]
  },
  {
    daysAgo: 121,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 1_300_00,
    description: "Petrol refill",
    tags: []
  },

  // Month 6 (151-180 days)
  {
    daysAgo: 178,
    accountName: "HDFC Bank",
    categoryName: "Salary",
    type: "income",
    amountMinor: 100_000_00,
    description: "Monthly salary",
    tags: ["salary", "recurring"]
  },
  {
    daysAgo: 177,
    accountName: "HDFC Bank",
    categoryName: "Rent",
    type: "expense",
    amountMinor: 20_000_00,
    description: "Flat rent payment",
    tags: ["rent", "recurring"]
  },
  {
    daysAgo: 176,
    accountName: "SBI Savings",
    categoryName: "Bonus",
    type: "income",
    amountMinor: 30_000_00,
    description: "Annual performance bonus",
    tags: ["bonus"]
  },
  {
    daysAgo: 175,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 174,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 1_150_00,
    description: "BigBasket grocery order",
    tags: ["groceries"]
  },
  {
    daysAgo: 173,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 165_00,
    description: "OLA ride",
    tags: []
  },
  {
    daysAgo: 172,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 3_000_00,
    description: "Reliance Trends shopping",
    tags: ["shopping"]
  },
  {
    daysAgo: 171,
    accountName: "HDFC Bank",
    categoryName: "Utilities",
    type: "expense",
    amountMinor: 1_200_00,
    description: "Electricity bill",
    tags: ["utilities", "recurring"]
  },
  {
    daysAgo: 170,
    accountName: "Cash Wallet",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 1_100_00,
    description: "Movie and dinner",
    tags: ["entertainment"]
  },
  {
    daysAgo: 169,
    accountName: "SBI Savings",
    categoryName: "Travel",
    type: "expense",
    amountMinor: 5_000_00,
    description: "Vacation hotel booking",
    tags: ["travel"]
  },
  {
    daysAgo: 168,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 1_050_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 167,
    accountName: "ICICI Credit Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 480_00,
    description: "SWIGGY order",
    tags: ["food"]
  },
  {
    daysAgo: 166,
    accountName: "Cash Wallet",
    categoryName: "Health",
    type: "expense",
    amountMinor: 900_00,
    description: "Hospital visit",
    tags: ["health"]
  },
  {
    daysAgo: 165,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 164,
    accountName: "HDFC Bank",
    categoryName: "Education",
    type: "expense",
    amountMinor: 3_000_00,
    description: "Online course subscription",
    tags: ["education"]
  },
  {
    daysAgo: 163,
    accountName: "Paytm Wallet",
    categoryName: "Insurance",
    type: "expense",
    amountMinor: 3_500_00,
    description: "LIC insurance premium",
    tags: ["insurance", "recurring"]
  },
  {
    daysAgo: 162,
    accountName: "Cash Wallet",
    categoryName: "Gifts",
    type: "expense",
    amountMinor: 1_100_00,
    description: "Baby shower gift",
    tags: ["gifts"]
  },
  {
    daysAgo: 161,
    accountName: "ICICI Credit Card",
    categoryName: "Shopping",
    type: "expense",
    amountMinor: 2_299_00,
    description: "AMAZON purchase",
    tags: ["shopping"]
  },
  {
    daysAgo: 160,
    accountName: "SBI Savings",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "ZOMATO delivery",
    tags: ["food"]
  },
  {
    daysAgo: 159,
    accountName: "HDFC Bank",
    categoryName: "Subscriptions",
    type: "expense",
    amountMinor: 199_00,
    description: "NETFLIX subscription",
    tags: ["subscriptions"]
  },
  {
    daysAgo: 158,
    accountName: "Cash Wallet",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 200_00,
    description: "Tea and snacks",
    tags: []
  },
  {
    daysAgo: 157,
    accountName: "Paytm Wallet",
    categoryName: "Transport",
    type: "expense",
    amountMinor: 140_00,
    description: "Uber ride",
    tags: []
  },
  {
    daysAgo: 156,
    accountName: "HDFC Bank",
    categoryName: "Interest",
    type: "income",
    amountMinor: 420_00,
    description: "Savings account interest",
    tags: []
  },
  {
    daysAgo: 155,
    accountName: "Sodexo Meal Card",
    categoryName: "Food & Dining",
    type: "expense",
    amountMinor: 350_00,
    description: "Lunch at office cafeteria",
    tags: ["food"]
  },
  {
    daysAgo: 154,
    accountName: "Cash Wallet",
    categoryName: "Groceries",
    type: "expense",
    amountMinor: 800_00,
    description: "Local market shopping",
    tags: ["groceries"]
  },
  {
    daysAgo: 153,
    accountName: "ICICI Credit Card",
    categoryName: "Entertainment",
    type: "expense",
    amountMinor: 700_00,
    description: "Movie tickets",
    tags: ["entertainment"]
  },
  {
    daysAgo: 152,
    accountName: "SBI Savings",
    categoryName: "Health",
    type: "expense",
    amountMinor: 500_00,
    description: "Pharmacy medicines",
    tags: ["health"]
  },
  {
    daysAgo: 151,
    accountName: "Paytm Wallet",
    categoryName: "Fuel",
    type: "expense",
    amountMinor: 1_400_00,
    description: "Petrol refill",
    tags: []
  },
  {
    daysAgo: 170,
    accountName: "Cash Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 5_000_00,
    description: "Cash withdrawal top-up",
    tags: []
  },
  {
    daysAgo: 140,
    accountName: "Cash Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 4_000_00,
    description: "Cash withdrawal top-up",
    tags: []
  },
  {
    daysAgo: 100,
    accountName: "Cash Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 5_000_00,
    description: "Cash withdrawal top-up",
    tags: []
  },
  {
    daysAgo: 60,
    accountName: "Cash Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 4_500_00,
    description: "Cash withdrawal top-up",
    tags: []
  },
  {
    daysAgo: 20,
    accountName: "Cash Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 5_000_00,
    description: "Cash withdrawal top-up",
    tags: []
  },
  {
    daysAgo: 165,
    accountName: "Paytm Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 6_000_00,
    description: "Wallet top-up from bank",
    tags: []
  },
  {
    daysAgo: 130,
    accountName: "Paytm Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 6_000_00,
    description: "Wallet top-up from bank",
    tags: []
  },
  {
    daysAgo: 95,
    accountName: "Paytm Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 6_000_00,
    description: "Wallet top-up from bank",
    tags: []
  },
  {
    daysAgo: 55,
    accountName: "Paytm Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 6_000_00,
    description: "Wallet top-up from bank",
    tags: []
  },
  {
    daysAgo: 15,
    accountName: "Paytm Wallet",
    categoryName: null,
    type: "income",
    amountMinor: 6_000_00,
    description: "Wallet top-up from bank",
    tags: []
  }
] as const;

export function createMockStore(): MockStore {
  const nextAccountId = createIdGenerator("a0");
  const nextCategoryId = createIdGenerator("c0");
  const nextCategoryRuleId = createIdGenerator("c1");
  const nextTransactionId = createIdGenerator("70");
  const nextTransferGroupId = createIdGenerator("7f");
  const nextAssetId = createIdGenerator("a5");
  const nextValuationId = createIdGenerator("5a");
  const nextImportBatchId = createIdGenerator("1b");
  const nextStagedRowId = createIdGenerator("5b");
  const nextRecurringRuleId = createIdGenerator("e0");

  const store: MockStore = {
    accounts: [],
    categories: [],
    categoryRules: [],
    transactions: [],
    assets: [],
    valuations: [],
    importBatches: [],
    stagedRows: [],
    monthlyRollups: [],
    recurringRules: [],
    profile: {
      userId: MOCK_USER_ID,
      displayName: "Mock User",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(90)
    },
    savedMappings: new Map(),
    committedBatchTransactionIds: new Map(),
    idempotency: {
      accounts: new Map(),
      accountArchive: new Set(),
      categories: new Map(),
      categoryArchive: new Set(),
      categoryRules: new Map(),
      categoryRuleDelete: new Set(),
      transactions: new Map(),
      transfers: new Map(),
      assets: new Map(),
      assetClose: new Set(),
      valuations: new Map(),
      recurringRules: new Map()
    },
    nextAccountId,
    nextCategoryId,
    nextCategoryRuleId,
    nextTransactionId,
    nextTransferGroupId,
    nextAssetId,
    nextValuationId,
    nextImportBatchId,
    nextStagedRowId,
    nextRecurringRuleId
  };

  seedAccounts(store);
  seedCategories(store);
  seedRecurringRules(store);
  seedCategoryRules(store);
  seedTransactions(store);
  seedAssetsAndValuations(store);
  seedImportBatch(store);
  seedImportBatch2(store);
  seedMonthlyRollups(store);

  return store;
}

function seedAccounts(store: MockStore): void {
  const seeded: ReadonlyArray<{
    name: string;
    type: AccountDto["type"];
    openingBalanceMinor: number;
  }> = [
    { name: "HDFC Bank", type: "bank", openingBalanceMinor: 85_000_00 },
    { name: "Cash Wallet", type: "cash", openingBalanceMinor: 2_500_00 },
    { name: "ICICI Credit Card", type: "credit_card", openingBalanceMinor: 0 },
    { name: "Paytm Wallet", type: "wallet", openingBalanceMinor: 1_200_00 },
    { name: "SBI Savings", type: "bank", openingBalanceMinor: 120_000_00 },
    { name: "Sodexo Meal Card", type: "wallet", openingBalanceMinor: 5_000_00 }
  ];

  for (const account of seeded) {
    const createdAt = daysAgo(90);
    store.accounts.push({
      id: store.nextAccountId(),
      userId: store.profile.userId,
      name: account.name,
      type: account.type,
      currency: "INR",
      openingBalanceMinor: account.openingBalanceMinor,
      balanceMinor: account.openingBalanceMinor,
      isArchived: false,
      createdAt,
      updatedAt: createdAt
    });
  }
}

function seedCategories(store: MockStore): void {
  const expense = [
    "Food & Dining",
    "Groceries",
    "Transport",
    "Utilities",
    "Rent",
    "Shopping",
    "Entertainment",
    "Health",
    "Travel",
    "Education",
    "Insurance",
    "Subscriptions",
    "Gifts",
    "Fuel"
  ];
  const income = ["Salary", "Freelance", "Interest", "Bonus", "Dividends"];

  for (const name of expense) {
    const createdAt = daysAgo(90);
    store.categories.push({
      id: store.nextCategoryId(),
      userId: store.profile.userId,
      name,
      kind: "expense",
      isArchived: false,
      createdAt,
      updatedAt: createdAt
    });
  }
  for (const name of income) {
    const createdAt = daysAgo(90);
    store.categories.push({
      id: store.nextCategoryId(),
      userId: store.profile.userId,
      name,
      kind: "income",
      isArchived: false,
      createdAt,
      updatedAt: createdAt
    });
  }
}

function seedRecurringRules(store: MockStore): void {
  const templates: ReadonlyArray<{
    accountName: string;
    categoryName: string;
    type: "expense" | "income";
    amountMinor: number;
    description: string;
    rrule: string;
    isPaused: boolean;
  }> = [
    {
      accountName: "HDFC Bank",
      categoryName: "Rent",
      type: "expense",
      amountMinor: 32_000_00,
      description: "Monthly rent",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      isPaused: false
    },
    {
      accountName: "HDFC Bank",
      categoryName: "Salary",
      type: "income",
      amountMinor: 125_000_00,
      description: "Salary credit",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=28",
      isPaused: false
    },
    {
      accountName: "ICICI Credit Card",
      categoryName: "Subscriptions",
      type: "expense",
      amountMinor: 649_00,
      description: "Streaming subscription",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=12",
      isPaused: true
    }
  ];

  for (const template of templates) {
    const account = store.accounts.find((candidate) => candidate.name === template.accountName);
    const category = store.categories.find((candidate) => candidate.name === template.categoryName);
    if (account === undefined || category === undefined) continue;
    const createdAt = daysAgo(75);
    store.recurringRules.push({
      id: store.nextRecurringRuleId(),
      userId: store.profile.userId,
      template: {
        accountId: account.id,
        categoryId: category.id,
        type: template.type,
        amountMinor: template.amountMinor,
        description: template.description,
        tags: []
      },
      rrule: template.rrule,
      startAt: daysAgo(180),
      nextRunAt: daysAgo(-8),
      lastRunAt: daysAgo(22),
      isPaused: template.isPaused,
      createdAt,
      updatedAt: createdAt
    });
  }
}

function seedCategoryRules(store: MockStore): void {
  const rules: ReadonlyArray<{ pattern: string; categoryName: string }> = [
    { pattern: "SWIGGY", categoryName: "Food & Dining" },
    { pattern: "UBER", categoryName: "Transport" },
    { pattern: "AMAZON", categoryName: "Shopping" },
    { pattern: "NETFLIX", categoryName: "Subscriptions" },
    { pattern: "SPOTIFY", categoryName: "Subscriptions" },
    { pattern: "ZOMATO", categoryName: "Food & Dining" }
  ];

  for (const rule of rules) {
    const category = store.categories.find((candidate) => candidate.name === rule.categoryName);
    if (category === undefined) continue;
    const createdAt = daysAgo(60);
    store.categoryRules.push({
      id: store.nextCategoryRuleId(),
      userId: store.profile.userId,
      pattern: rule.pattern,
      categoryId: category.id,
      createdAt,
      updatedAt: createdAt
    });
  }
}

function seedTransactions(store: MockStore): void {
  for (const template of TXN_TEMPLATES) {
    const account = store.accounts.find((candidate) => candidate.name === template.accountName);
    if (account === undefined) continue;
    const category =
      template.categoryName === null
        ? undefined
        : store.categories.find((candidate) => candidate.name === template.categoryName);

    const occurredAt = daysAgo(template.daysAgo);
    const transaction: TransactionDto = {
      id: store.nextTransactionId(),
      userId: store.profile.userId,
      accountId: account.id,
      ...(category === undefined ? {} : { categoryId: category.id }),
      type: template.type,
      amountMinor: template.amountMinor,
      currency: "INR",
      occurredAt,
      description: template.description,
      tags: [...template.tags],
      source: "manual",
      status: "posted",
      createdAt: occurredAt,
      updatedAt: occurredAt
    };
    store.transactions.push(transaction);
    applyBalanceDelta(
      store,
      account.id,
      template.type === "income" ? template.amountMinor : -template.amountMinor
    );
  }

  reverseSeedTransaction(store, "ATM withdrawal");
  seedTransfers(store);
}

/** Seeds one already-reversed transaction so reversal UI states have something to show. */
function reverseSeedTransaction(store: MockStore, description: string): void {
  const original = store.transactions.find((txn) => txn.description === description);
  if (original === undefined) return;

  const reversalOccurredAt = new Date().toISOString();
  const reversal: TransactionDto = {
    ...original,
    id: store.nextTransactionId(),
    type: original.type === "expense" ? "income" : "expense",
    status: "reversal",
    reversalOf: original.id,
    description: `Reversal: ${original.description}`,
    occurredAt: reversalOccurredAt,
    createdAt: reversalOccurredAt,
    updatedAt: reversalOccurredAt
  };
  store.transactions.push(reversal);
  original.status = "reversed";
  original.reversedBy = reversal.id;
  original.updatedAt = reversalOccurredAt;

  applyBalanceDelta(
    store,
    original.accountId,
    original.type === "expense" ? original.amountMinor : -original.amountMinor
  );
}

const TRANSFER_TEMPLATES: ReadonlyArray<{
  daysAgo: number;
  fromAccountName: string;
  toAccountName: string;
  amountMinor: number;
  description: string;
  tags: readonly string[];
  /** When set, seeds a second linked pair reversing this one, `daysAgo` days ago. */
  reversedDaysAgo?: number;
}> = [
  {
    daysAgo: 9,
    fromAccountName: "HDFC Bank",
    toAccountName: "Cash Wallet",
    amountMinor: 5_000_00,
    description: "ATM cash withdrawal transfer",
    tags: []
  },
  {
    daysAgo: 30,
    fromAccountName: "Cash Wallet",
    toAccountName: "ICICI Credit Card",
    amountMinor: 2_500_00,
    description: "Credit card bill payment",
    tags: ["bills"],
    reversedDaysAgo: 28
  },
  {
    daysAgo: 45,
    fromAccountName: "HDFC Bank",
    toAccountName: "SBI Savings",
    amountMinor: 15_000_00,
    description: "Moving emergency fund",
    tags: ["savings"]
  },
  {
    daysAgo: 60,
    fromAccountName: "HDFC Bank",
    toAccountName: "Sodexo Meal Card",
    amountMinor: 1_000_00,
    description: "Meal card recharge",
    tags: []
  },
  {
    daysAgo: 88,
    fromAccountName: "SBI Savings",
    toAccountName: "HDFC Bank",
    amountMinor: 8_000_00,
    description: "Bringing funds back for rent",
    tags: []
  },
  {
    daysAgo: 120,
    fromAccountName: "HDFC Bank",
    toAccountName: "Paytm Wallet",
    amountMinor: 3_000_00,
    description: "Wallet top-up before trip",
    tags: ["travel"]
  },
  {
    daysAgo: 150,
    fromAccountName: "SBI Savings",
    toAccountName: "Paytm Wallet",
    amountMinor: 2_000_00,
    description: "UPI wallet funding",
    tags: []
  }
] as const;

function seedTransfers(store: MockStore): void {
  for (const template of TRANSFER_TEMPLATES) {
    const from = store.accounts.find((account) => account.name === template.fromAccountName);
    const to = store.accounts.find((account) => account.name === template.toAccountName);
    if (from === undefined || to === undefined) continue;

    const transferGroupId = store.nextTransferGroupId();
    const occurredAt = daysAgo(template.daysAgo);

    const fromTransaction: TransactionDto = {
      id: store.nextTransactionId(),
      userId: store.profile.userId,
      accountId: from.id,
      type: "expense",
      amountMinor: template.amountMinor,
      currency: "INR",
      occurredAt,
      description: template.description,
      tags: [...template.tags],
      source: "manual",
      status: "posted",
      transferGroupId,
      createdAt: occurredAt,
      updatedAt: occurredAt
    };
    const toTransaction: TransactionDto = {
      id: store.nextTransactionId(),
      userId: store.profile.userId,
      accountId: to.id,
      type: "income",
      amountMinor: template.amountMinor,
      currency: "INR",
      occurredAt,
      description: template.description,
      tags: [...template.tags],
      source: "manual",
      status: "posted",
      transferGroupId,
      createdAt: occurredAt,
      updatedAt: occurredAt
    };

    store.transactions.push(fromTransaction, toTransaction);
    applyBalanceDelta(store, from.id, -fromTransaction.amountMinor);
    applyBalanceDelta(store, to.id, toTransaction.amountMinor);

    if (template.reversedDaysAgo !== undefined) {
      reverseTransferGroup(store, fromTransaction, toTransaction, template.reversedDaysAgo);
    }
  }
}

/** Mirrors apps/api transfer.service.ts's reverse(): a new linked pair, opposite type/delta, original legs marked reversed. */
function reverseTransferGroup(
  store: MockStore,
  fromTransaction: TransactionDto,
  toTransaction: TransactionDto,
  reversedDaysAgo: number
): void {
  const newTransferGroupId = store.nextTransferGroupId();
  const reversedAt = daysAgo(reversedDaysAgo);

  const fromReversal: TransactionDto = {
    ...fromTransaction,
    id: store.nextTransactionId(),
    type: "income",
    status: "reversal",
    reversalOf: fromTransaction.id,
    transferGroupId: newTransferGroupId,
    description: `Reversal: ${fromTransaction.description}`,
    occurredAt: reversedAt,
    createdAt: reversedAt,
    updatedAt: reversedAt
  };
  const toReversal: TransactionDto = {
    ...toTransaction,
    id: store.nextTransactionId(),
    type: "expense",
    status: "reversal",
    reversalOf: toTransaction.id,
    transferGroupId: newTransferGroupId,
    description: `Reversal: ${toTransaction.description}`,
    occurredAt: reversedAt,
    createdAt: reversedAt,
    updatedAt: reversedAt
  };

  store.transactions.push(fromReversal, toReversal);
  fromTransaction.status = "reversed";
  fromTransaction.reversedBy = fromReversal.id;
  fromTransaction.updatedAt = reversedAt;
  toTransaction.status = "reversed";
  toTransaction.reversedBy = toReversal.id;
  toTransaction.updatedAt = reversedAt;

  applyBalanceDelta(store, fromTransaction.accountId, fromTransaction.amountMinor);
  applyBalanceDelta(store, toTransaction.accountId, -toTransaction.amountMinor);
}

/** Mirrors apps/api asset.service.ts: creating an asset seeds an opening "manual" valuation. */
export function pushValuation(
  store: MockStore,
  assetId: string,
  valueMinor: number,
  valuedAt: string
): void {
  store.valuations.push({
    id: store.nextValuationId(),
    assetId,
    userId: store.profile.userId,
    valueMinor,
    valuedAt,
    source: "manual",
    createdAt: valuedAt
  });
}

function seedAssetsAndValuations(store: MockStore): void {
  const fdOpenedAt = daysAgo(180);
  const fixedDeposit: AssetDto = {
    id: store.nextAssetId(),
    userId: store.profile.userId,
    kind: "fixed_deposit",
    name: "HDFC Fixed Deposit",
    openedAt: fdOpenedAt,
    maturityAt: daysAgo(-540),
    annualRateBps: 700,
    isClosed: false,
    createdAt: fdOpenedAt,
    updatedAt: fdOpenedAt
  };
  store.assets.push(fixedDeposit);
  pushValuation(store, fixedDeposit.id, 50_000_00, fdOpenedAt);
  pushValuation(store, fixedDeposit.id, 50_875_00, daysAgo(10));

  const goldOpenedAt = daysAgo(365);
  const gold: AssetDto = {
    id: store.nextAssetId(),
    userId: store.profile.userId,
    kind: "gold",
    name: "Gold Jewellery",
    openedAt: goldOpenedAt,
    quantityMilliUnits: 25_000,
    isClosed: false,
    createdAt: goldOpenedAt,
    updatedAt: goldOpenedAt
  };
  store.assets.push(gold);
  pushValuation(store, gold.id, 15_000_00, goldOpenedAt);
  pushValuation(store, gold.id, 16_200_00, daysAgo(5));

  const loanOpenedAt = daysAgo(30);
  const loan: AssetDto = {
    id: store.nextAssetId(),
    userId: store.profile.userId,
    kind: "loan_receivable",
    name: "Loan to a friend",
    openedAt: loanOpenedAt,
    isClosed: false,
    createdAt: loanOpenedAt,
    updatedAt: loanOpenedAt
  };
  store.assets.push(loan);
  pushValuation(store, loan.id, 10_000_00, loanOpenedAt);

  const silverOpenedAt = daysAgo(120);
  const silver: AssetDto = {
    id: store.nextAssetId(),
    userId: store.profile.userId,
    kind: "silver",
    name: "Silver Coins",
    openedAt: silverOpenedAt,
    quantityMilliUnits: 5_000,
    isClosed: false,
    createdAt: silverOpenedAt,
    updatedAt: silverOpenedAt
  };
  store.assets.push(silver);
  pushValuation(store, silver.id, 8_000_00, silverOpenedAt);
  pushValuation(store, silver.id, 8_500_00, daysAgo(20));
}

function seedImportBatch(store: MockStore): void {
  const account = store.accounts.find((candidate) => candidate.name === "HDFC Bank");
  if (account === undefined) return;

  const mapping: ColumnMappingDto = {
    date: "Date",
    description: "Narration",
    dateFormat: "DD/MM/YYYY",
    amountConvention: "debit_credit_cols",
    debit: "Withdrawal Amt.",
    credit: "Deposit Amt."
  };
  store.savedMappings.set(account.id, mapping);

  const createdAt = daysAgo(3);
  const batch: ImportBatchDto = {
    id: store.nextImportBatchId(),
    userId: store.profile.userId,
    accountId: account.id,
    filename: "hdfc-statement-jan.csv",
    fileHash: "mock-file-hash",
    mapping,
    status: "staged",
    stats: { total: 3, staged: 3, duplicates: 0, committed: 0 },
    createdAt,
    updatedAt: createdAt
  };
  store.importBatches.push(batch);

  const rows: ReadonlyArray<{
    description: string;
    amountMinor: number;
    type: "expense" | "income";
    daysAgo: number;
  }> = [
    { description: "SWIGGY order", amountMinor: 45_00, type: "expense", daysAgo: 5 },
    { description: "Salary credit", amountMinor: 9_500_00, type: "income", daysAgo: 4 },
    { description: "UBER ride", amountMinor: 18_00, type: "expense", daysAgo: 2 }
  ];

  for (const row of rows) {
    const rule = store.categoryRules.find((candidate) =>
      row.description.toUpperCase().includes(candidate.pattern)
    );
    store.stagedRows.push({
      id: store.nextStagedRowId(),
      batchId: batch.id,
      rowNumber: store.stagedRows.length + 1,
      raw: {
        Date: "01/01/2026",
        Narration: row.description,
        "Withdrawal Amt.": row.type === "expense" ? formatMinorInput(row.amountMinor) : "",
        "Deposit Amt.": row.type === "income" ? formatMinorInput(row.amountMinor) : ""
      },
      parsed: {
        occurredAt: daysAgo(row.daysAgo),
        amountMinor: row.amountMinor,
        type: row.type,
        description: row.description
      },
      ...(rule === undefined ? {} : { suggestedCategoryId: rule.categoryId }),
      problems: [],
      isDuplicate: false,
      include: true
    });
  }
}

function seedImportBatch2(store: MockStore): void {
  const account = store.accounts.find((candidate) => candidate.name === "SBI Savings");
  if (account === undefined) return;

  const mapping: ColumnMappingDto = {
    date: "Transaction Date",
    description: "Description",
    dateFormat: "YYYY-MM-DD",
    amountConvention: "single_signed",
    amount: "Amount"
  };

  const committedAt = daysAgo(15);
  const batch: ImportBatchDto = {
    id: store.nextImportBatchId(),
    userId: store.profile.userId,
    accountId: account.id,
    filename: "sbi-statement-dec.csv",
    fileHash: "mock-file-hash-2",
    mapping,
    status: "committed",
    committedAt,
    stats: { total: 4, staged: 0, duplicates: 0, committed: 4 },
    createdAt: daysAgo(20),
    updatedAt: committedAt
  };
  store.importBatches.push(batch);

  const rows: ReadonlyArray<{
    description: string;
    amountMinor: number;
    type: "expense" | "income";
    daysAgo: number;
  }> = [
    { description: "Dividend income", amountMinor: 5_000_00, type: "income", daysAgo: 18 },
    { description: "Netflix subscription", amountMinor: 199_00, type: "expense", daysAgo: 17 },
    { description: "Electricity payment", amountMinor: 1_200_00, type: "expense", daysAgo: 16 },
    { description: "Bonus transfer", amountMinor: 15_000_00, type: "income", daysAgo: 14 }
  ];

  for (const row of rows) {
    const rule = store.categoryRules.find((candidate) =>
      row.description.toUpperCase().includes(candidate.pattern)
    );
    store.stagedRows.push({
      id: store.nextStagedRowId(),
      batchId: batch.id,
      rowNumber: store.stagedRows.length + 1,
      raw: {
        "Transaction Date": "2026-01-15",
        Description: row.description,
        Amount: `${row.type === "income" ? "" : "-"}${formatMinorInput(row.amountMinor)}`
      },
      parsed: {
        occurredAt: daysAgo(row.daysAgo),
        amountMinor: row.amountMinor,
        type: row.type,
        description: row.description
      },
      ...(rule === undefined ? {} : { suggestedCategoryId: rule.categoryId }),
      problems: [],
      isDuplicate: false,
      include: true
    });
  }
}

/** First-of-month, `monthsAgo` calendar months before the current one, as a YYYY-MM key. */
function monthKey(monthsAgo: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - monthsAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** ~02:15 on the 1st of the month after `monthsAgo` closed — when the rollup cron would have run. */
function monthComputedAt(monthsAgo: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - monthsAgo + 1);
  date.setHours(2, 15, 0, 0);
  return date.toISOString();
}

/**
 * Rollups are a cron-computed cache in the real system (BACKEND.md §6), never
 * derived live — so these are seeded as standalone snapshots rather than
 * aggregated from seedTransactions, which only covers the last ~60 days and
 * wouldn't cover both rollup months below.
 */
function seedMonthlyRollups(store: MockStore): void {
  const categoryIdFor = (name: string): string | undefined =>
    store.categories.find((category) => category.name === name)?.id;
  const accountIdFor = (name: string): string =>
    store.accounts.find((account) => account.name === name)?.id ?? name;

  const rollups: ReadonlyArray<{
    monthsAgo: number;
    byCategory: ReadonlyArray<{
      categoryName: string | null;
      spentMinor: number;
      txnCount: number;
    }>;
    totalIncomeMinor: number;
    byAccount: ReadonlyArray<{ accountName: string; netMinor: number }>;
  }> = [
    {
      monthsAgo: 1,
      byCategory: [
        { categoryName: "Food & Dining", spentMinor: 1_842_000, txnCount: 14 },
        { categoryName: "Groceries", spentMinor: 1_256_000, txnCount: 9 },
        { categoryName: "Transport", spentMinor: 984_500, txnCount: 22 },
        { categoryName: "Utilities", spentMinor: 745_000, txnCount: 4 },
        { categoryName: "Shopping", spentMinor: 189_000, txnCount: 3 },
        { categoryName: null, spentMinor: 826_000, txnCount: 7 }
      ],
      totalIncomeMinor: 8_500_000,
      byAccount: [
        { accountName: "HDFC Bank", netMinor: 1_657_500 },
        { accountName: "ICICI Credit Card", netMinor: -2_340_000 },
        { accountName: "Cash Wallet", netMinor: -184_000 },
        { accountName: "SBI Savings", netMinor: 0 }
      ]
    },
    {
      monthsAgo: 2,
      byCategory: [
        { categoryName: "Groceries", spentMinor: 1_620_000, txnCount: 12 },
        { categoryName: "Transport", spentMinor: 1_140_000, txnCount: 26 },
        { categoryName: "Food & Dining", spentMinor: 980_000, txnCount: 7 },
        { categoryName: "Utilities", spentMinor: 720_000, txnCount: 4 },
        { categoryName: null, spentMinor: 1_460_000, txnCount: 5 }
      ],
      totalIncomeMinor: 8_500_000,
      byAccount: [
        { accountName: "HDFC Bank", netMinor: 2_580_000 },
        { accountName: "ICICI Credit Card", netMinor: -1_420_000 },
        { accountName: "Cash Wallet", netMinor: -90_000 }
      ]
    }
  ];

  for (const rollup of rollups) {
    const byCategory = rollup.byCategory.map((category) => {
      const categoryId =
        category.categoryName === null ? undefined : categoryIdFor(category.categoryName);
      return {
        ...(categoryId === undefined ? {} : { categoryId }),
        spentMinor: category.spentMinor,
        incomeMinor: 0,
        txnCount: category.txnCount
      };
    });
    store.monthlyRollups.push({
      userId: store.profile.userId,
      month: monthKey(rollup.monthsAgo),
      byCategory,
      byAccount: rollup.byAccount.map((account) => ({
        accountId: accountIdFor(account.accountName),
        netMinor: account.netMinor
      })),
      totalExpenseMinor: rollup.byCategory.reduce((sum, category) => sum + category.spentMinor, 0),
      totalIncomeMinor: rollup.totalIncomeMinor,
      computedAt: monthComputedAt(rollup.monthsAgo)
    });
  }
}

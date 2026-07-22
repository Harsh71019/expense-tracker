import { COLUMN_MAPPING_PRESETS, type ImportBatch } from "@vyaya/shared";

import type { SeededAccounts } from "./accounts.js";
import type { SeedServices } from "./context.js";

const HDFC_MAPPING = COLUMN_MAPPING_PRESETS.hdfc;

export type SeededImports = Readonly<{
  stagedBatch: ImportBatch | undefined;
  committedBatch: ImportBatch | undefined;
  revertedBatch: ImportBatch | undefined;
  workerDetected: boolean;
}>;

type FixtureRow = Readonly<{
  daysAgo: number;
  narration: string;
  debit?: string;
  credit?: string;
}>;

function formatDdMmYyyy(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Real COLUMN_MAPPING_PRESETS.hdfc column names (SEEDING-PLAN.md §8) — same shape imports.parse.integration.ts already trusts. */
function buildCsv(rows: readonly FixtureRow[]): Buffer {
  const header = "Date,Narration,Withdrawal Amt.,Deposit Amt.";
  const lines = rows.map(
    (row) =>
      `${formatDdMmYyyy(row.daysAgo)},${row.narration},${row.debit ?? ""},${row.credit ?? ""}`
  );
  return Buffer.from([header, ...lines].join("\n"), "utf8");
}

/**
 * Deliberately messy: a duplicate row (same day/amount/description twice —
 * SWIGGY/AMAZON pattern-matches seed/category-rules.ts's rules so the preview
 * also shows auto-suggested categories), a categorically-invalid date
 * (30/02 doesn't exist — parseExplicitDate rejects it, not silently rolling
 * over to March), and one description with no matching rule at all. Left
 * "staged" on purpose so a developer can open the preview/mapping-review
 * screen and see all of that at once.
 */
const STAGED_ROWS: readonly FixtureRow[] = [
  { daysAgo: 20, narration: "SWIGGY BANGALORE", debit: "450.00" },
  { daysAgo: 18, narration: "IRCTC TICKET BOOKING", debit: "1200.00" },
  { daysAgo: 15, narration: "AMAZON RETAIL", debit: "2200.50" },
  { daysAgo: 15, narration: "AMAZON RETAIL", debit: "2200.50" },
  { daysAgo: 10, narration: "SALARY CREDIT", credit: "50000.00" },
  { daysAgo: 9, narration: "UNKNOWN FEE", debit: "99.00" }, // date column below is overridden to an invalid one
  { daysAgo: 5, narration: "NETFLIX SUBSCRIPTION", debit: "649.00" },
  { daysAgo: 3, narration: "UBER TRIP", debit: "250.00" }
];

/** A clean, fully-committable statement — every row parses, nothing's a duplicate. */
const COMMITTABLE_ROWS: readonly FixtureRow[] = [
  { daysAgo: 40, narration: "AMAZON RETAIL", debit: "899.00" },
  { daysAgo: 38, narration: "UBER TRIP", debit: "180.00" },
  { daysAgo: 35, narration: "SALARY CREDIT", credit: "5000.00" }
];

/** A second clean statement, committed then reverted, to exercise the revert-history UI. */
const REVERTIBLE_ROWS: readonly FixtureRow[] = [
  { daysAgo: 60, narration: "IRCTC TICKET BOOKING", debit: "600.00" },
  { daysAgo: 58, narration: "SWIGGY BANGALORE", debit: "320.00" }
];

function buildStagedCsv(): Buffer {
  const header = "Date,Narration,Withdrawal Amt.,Deposit Amt.";
  const lines = STAGED_ROWS.map((row, index) => {
    // Row index 5 ("UNKNOWN FEE") is the deliberately-invalid-date row —
    // 30/02 never exists, in any year.
    const date = index === 5 ? "30/02/2026" : formatDdMmYyyy(row.daysAgo);
    return `${date},${row.narration},${row.debit ?? ""},${row.credit ?? ""}`;
  });
  return Buffer.from([header, ...lines].join("\n"), "utf8");
}

async function waitForParse(
  services: SeedServices,
  userId: string,
  batchId: string,
  timeoutMs = 15_000
): Promise<ImportBatch> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const batch = await services.importBatches.findById(userId, batchId);
    if (batch === null) throw new Error(`seed: import batch ${batchId} disappeared.`);
    if (batch.status !== "pending") return batch;
    if (Date.now() > deadline) {
      throw new Error(
        `seed: import batch ${batchId} is still "pending" after ${timeoutMs}ms — is the worker container running?`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Three batches exercising every ImportBatchStatus except "pending" (which
 * only ever exists for the instant between upload and parse). Relies on the
 * real worker container consuming the real BullMQ parse job — see
 * SEEDING-PLAN.md §4b for why that's deliberate rather than calling
 * `parseFile` directly. Skips entirely (with a loud warning) if no worker
 * heartbeat is detected, since nothing would ever parse the batch.
 */
export async function seedImports(
  services: SeedServices,
  userId: string,
  accounts: SeededAccounts
): Promise<SeededImports> {
  const workerDetected = await services.redis.hasWorkerHeartbeat();
  if (!workerDetected) {
    console.warn(
      "seed: no worker heartbeat detected (is `docker compose up -d worker` running?) " +
        "— skipping import batches, since nothing would ever parse them."
    );
    return {
      stagedBatch: undefined,
      committedBatch: undefined,
      revertedBatch: undefined,
      workerDetected: false
    };
  }

  const staged = await services.imports.createBatch(
    userId,
    accounts.bank.id,
    "hdfc-statement-latest.csv",
    "text/csv",
    buildStagedCsv(),
    HDFC_MAPPING
  );
  const stagedBatch = await waitForParse(services, userId, staged.id);

  const toCommit = await services.imports.createBatch(
    userId,
    accounts.bank.id,
    "hdfc-statement-previous.csv",
    "text/csv",
    buildCsv(COMMITTABLE_ROWS),
    HDFC_MAPPING
  );
  await waitForParse(services, userId, toCommit.id);
  const committedBatch = await services.imports.commitBatch(userId, toCommit.id);

  const toRevert = await services.imports.createBatch(
    userId,
    accounts.bank.id,
    "hdfc-statement-old.csv",
    "text/csv",
    buildCsv(REVERTIBLE_ROWS),
    HDFC_MAPPING
  );
  await waitForParse(services, userId, toRevert.id);
  await services.imports.commitBatch(userId, toRevert.id);
  const revertedBatch = await services.imports.revertBatch(userId, toRevert.id);

  return { stagedBatch, committedBatch, revertedBatch, workerDetected: true };
}

import { toISTMonth } from "../../src/common/time/ist.js";
import { withTxn } from "../../src/common/db/db-txn.js";
import type { SeededAccounts } from "./accounts.js";
import type { SeededCategories } from "./categories.js";
import type { SeedServices } from "./context.js";

const DRIFT_MINOR = 137_00;

export type SeededNotifications = Readonly<{
  driftedAccountId: string;
  driftMinor: number;
}>;

/**
 * Manufactures a *real* balance drift rather than inserting a fake
 * notification row — nudges the cash account's cached balanceMinor directly,
 * with no corresponding transaction, exactly the mismatch class
 * BalanceVerifyService.verify() exists to catch (same primitive that bug
 * class would actually produce: a raw balance write outside the ledger).
 * trigger-crons.ts's balanceVerify.verify() call turns this into a genuine
 * `balance_drift` outbox entry, which notificationSweep.sweep() then hands
 * to the real worker's delivery pipeline — nothing here inserts an outbox
 * row for that type directly (SEEDING-PLAN.md §4).
 *
 * `budget_alert` and `monthly_report` have no real producer yet (no budgets
 * module; rollups-refresh doesn't enqueue a monthly_report notification) —
 * seeded directly here just so the delivery/adapter path and any
 * notification-history UI has at least one example of each to render.
 */
export async function seedNotificationsAndDrift(
  services: SeedServices,
  userId: string,
  accounts: SeededAccounts,
  categories: SeededCategories
): Promise<SeededNotifications> {
  await withTxn(services.db, (tx) =>
    services.accounts.applyBalanceDelta(userId, accounts.cash.id, DRIFT_MINOR, tx)
  );

  await withTxn(services.db, (tx) =>
    services.notificationOutbox.enqueue(
      userId,
      "budget_alert",
      {
        categoryId: categories.groceries.id,
        categoryName: categories.groceries.name,
        limitMinor: 5_000_00,
        spentMinor: 5_200_00
      },
      tx
    )
  );

  await withTxn(services.db, (tx) =>
    services.notificationOutbox.enqueue(
      userId,
      "monthly_report",
      {
        month: toISTMonth(new Date()),
        totalIncomeMinor: 85_420_00,
        totalExpenseMinor: 29_570_00
      },
      tx
    )
  );

  return { driftedAccountId: accounts.cash.id, driftMinor: DRIFT_MINOR };
}

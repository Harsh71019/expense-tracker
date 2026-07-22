import type { RecurringRule } from "@treasury-ops/shared";

import type { SeededAccounts } from "./accounts.js";
import type { SeededCategories } from "./categories.js";
import type { SeedServices } from "./context.js";

export type SeededRecurring = Readonly<{
  salary: RecurringRule;
  rent: RecurringRule;
  subscriptionPaused: RecurringRule;
}>;

/**
 * `startAt` two months back on a monthly rrule leaves `nextRunAt` overdue by
 * construction — trigger-crons.ts's repeated RecurringMaterializeService
 * .materialize() calls then have real backlog to catch up, each call
 * posting one occurrence per rule (SEEDING-PLAN.md §4a). One rule is left
 * paused to exercise that state in the UI.
 */
export async function seedRecurring(
  services: SeedServices,
  userId: string,
  accounts: SeededAccounts,
  categories: SeededCategories
): Promise<SeededRecurring> {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const salary = await services.recurring.create(userId, {
    template: {
      accountId: accounts.bank.id,
      categoryId: categories.salary.id,
      type: "income",
      amountMinor: 85_000_00,
      description: "Monthly salary",
      tags: ["salary", "recurring"]
    },
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    startAt: twoMonthsAgo
  });

  const rent = await services.recurring.create(userId, {
    template: {
      accountId: accounts.bank.id,
      categoryId: categories.rent.id,
      type: "expense",
      amountMinor: 18_500_00,
      description: "Flat rent",
      tags: ["rent", "recurring"]
    },
    rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
    startAt: twoMonthsAgo
  });

  const subscription = await services.recurring.create(userId, {
    template: {
      accountId: accounts.wallet.id,
      type: "expense",
      amountMinor: 649_00,
      description: "Streaming subscription",
      tags: ["subscription", "recurring"]
    },
    rrule: "FREQ=MONTHLY;BYMONTHDAY=15",
    startAt: oneMonthAgo
  });
  const subscriptionPaused = await services.recurring.update(userId, subscription.id, {
    isPaused: true
  });

  return { salary, rent, subscriptionPaused };
}

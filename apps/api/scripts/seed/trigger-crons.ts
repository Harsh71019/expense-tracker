import { toISTMonth } from "../../src/common/time/ist.js";
import type { SeedServices } from "./context.js";

const RECURRING_CATCHUP_ITERATIONS = 4;

/**
 * Invokes every @Cron-guarded service directly, once (or a few times for
 * recurring materialization's backlog), instead of waiting for real IST
 * wall-clock time — SEEDING-PLAN.md §4a. Requires the seed context to have
 * been created with SERVICE_ROLE forced to "worker" (context.ts does this),
 * or every one of these no-ops silently.
 *
 * Order matters: recurring materialization first (so its posted transactions
 * count toward the rollups computed next), then rollups (current+previous
 * per the real cron, plus every other seeded month directly via
 * MonthlyRollupRepository since the real cron is deliberately narrower than
 * a multi-month seed needs), then balance verification (so the manufactured
 * drift produces a real outbox entry), then the notification sweep (so that
 * drift entry — and the directly-seeded budget_alert/monthly_report rows —
 * actually get handed to the real worker's BullMQ delivery pipeline).
 */
export async function triggerCrons(
  services: SeedServices,
  userIds: readonly string[]
): Promise<void> {
  for (let i = 0; i < RECURRING_CATCHUP_ITERATIONS; i += 1) {
    await services.crons.recurringMaterialize.materialize();
  }

  await services.crons.rollupsRefresh.refresh();
  const now = new Date();
  for (const userId of userIds) {
    for (let monthsBack = 0; monthsBack <= 3; monthsBack += 1) {
      const month = toISTMonth(new Date(now.getFullYear(), now.getMonth() - monthsBack, 1));
      await services.monthlyRollups.recompute(userId, month);
    }
  }

  await services.crons.balanceVerify.verify();
  await services.crons.notificationSweep.sweep();
  await services.crons.stagedRowsCleanup.run();
}

import { eq, inArray } from "drizzle-orm";

import { user } from "../../src/common/db/auth-schema.js";
import { withTxn } from "../../src/common/db/db-txn.js";
import type { DrizzleDb } from "../../src/common/db/db.module.js";
import {
  accounts,
  assets,
  assetValuations,
  auditLog,
  categories,
  categoryRules,
  idempotencyRecords,
  importBatches,
  monthlyRollups,
  notificationOutbox,
  recurringRules,
  stagedRows,
  transactions,
  userProfiles
} from "../../src/common/db/schema/index.js";

/**
 * Deletes everything a userId owns, table by table, in reverse-dependency
 * order, inside one transaction — SEEDING-PLAN.md §6's decision. Not a real
 * cascade: none of this schema's `.references(() => user.id)` FKs specify
 * `{ onDelete: "cascade" }` (checked directly), so `DELETE FROM "user"` would
 * otherwise throw a foreign-key violation the moment any domain row still
 * references it. That's the *correct* posture for an append-only ledger —
 * cascade-deletable money tables is not a capability this schema should have,
 * even for a dev convenience flag — so this function does by hand what a
 * cascade would have done automatically.
 *
 * Better Auth's own `session`/`account` tables *do* cascade from `user.id`
 * (checked in auth-schema.ts) so deleting the `user` row last is enough to
 * clear those without this function touching them itself.
 */
export async function resetUser(db: DrizzleDb, userId: string): Promise<void> {
  await withTxn(db, async (tx) => {
    const batchIds = tx
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(eq(importBatches.userId, userId));
    await tx.delete(stagedRows).where(inArray(stagedRows.batchId, batchIds));

    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(assetValuations).where(eq(assetValuations.userId, userId));
    await tx.delete(recurringRules).where(eq(recurringRules.userId, userId));
    await tx.delete(categoryRules).where(eq(categoryRules.userId, userId));
    await tx.delete(importBatches).where(eq(importBatches.userId, userId));
    await tx.delete(assets).where(eq(assets.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(categories).where(eq(categories.userId, userId));

    await tx.delete(notificationOutbox).where(eq(notificationOutbox.userId, userId));
    await tx.delete(auditLog).where(eq(auditLog.userId, userId));
    await tx.delete(idempotencyRecords).where(eq(idempotencyRecords.userId, userId));
    await tx.delete(monthlyRollups).where(eq(monthlyRollups.userId, userId));
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));

    await tx.delete(user).where(eq(user.id, userId));
  });
}

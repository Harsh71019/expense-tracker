import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { assetFundings, transactions } from "./schema/index.js";

/**
 * The single definition of a funding whose source remains an active cash
 * outflow. Consumers should use this predicate instead of copying a join with
 * subtly different reversal semantics.
 */
export function isActiveAssetFunding(): SQL {
  return (
    and(
      eq(assetFundings.status, "posted"),
      eq(transactions.status, "posted"),
      isNull(transactions.reversalOf),
      isNull(transactions.reversedBy)
    ) ?? sql`false`
  );
}

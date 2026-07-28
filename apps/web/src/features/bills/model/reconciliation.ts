import type { BillDetail } from "@treasury-ops/shared";

export function reconciliationGate(detail: BillDetail): Readonly<{
  resolved: number;
  unresolved: number;
  canReconcile: boolean;
}> {
  const stats = detail.reconciliation.stats;
  return {
    resolved: stats.matched + stats.acknowledged,
    unresolved: detail.reconciliation.unresolved,
    canReconcile:
      detail.activeStatement?.status === "staged" &&
      detail.reconciliation.unresolved === 0 &&
      detail.bill.reconciliationStatus === "awaiting_statement"
  };
}

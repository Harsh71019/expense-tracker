"use client";

import type { RecurringReconciliationReviewItem } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { useRecurringReconciliations } from "../hooks/use-recurring-reconciliations";
import { ReconciliationReviewCard } from "./reconciliation-review-card";

/**
 * A recurring rule posts speculatively; n8n's real bank-debit transaction
 * may later turn out to be an exact match (auto-reconciled silently,
 * nothing to show here) or an exception the matcher couldn't resolve on its
 * own -- that's what this panel surfaces. Renders nothing when there's
 * nothing pending, so it's invisible on the common path.
 */
export function ReconciliationReviewPanel({
  initialReconciliations
}: Readonly<{ initialReconciliations: RecurringReconciliationReviewItem[] }>): ReactNode {
  const reconciliations = useRecurringReconciliations(initialReconciliations);
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const items = (reconciliations.data ?? initialReconciliations).filter(
    (item) => !dismissedIds.has(item.id)
  );

  if (items.length === 0) return null;

  return (
    <section aria-label="Recurring reconciliations needing review" className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
          Needs your review
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground">
          {items.length} recurring {items.length === 1 ? "charge" : "charges"} to confirm
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          A real bank transaction came in that might be one of your recurring charges, but we
          couldn&apos;t tell for certain.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <ReconciliationReviewCard
            key={item.id}
            item={item}
            onResolved={(id) => setDismissedIds((current) => new Set(current).add(id))}
          />
        ))}
      </div>
    </section>
  );
}

"use client";

import type { DeclaredDebt, DeclaredDebtPage } from "@treasury-ops/shared";
import { Link2, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";

import { DEBT_KIND_LABELS, bpsToPercentLabel, highCostThresholdLabel } from "../model/debt-form";

type DebtInventoryProps = Readonly<{
  page: DeclaredDebtPage | null;
  isLoading: boolean;
  onAddDebt: () => void;
  onResolveDebt: (debt: DeclaredDebt) => void;
}>;

/**
 * The active declared-debt list.
 *
 * Two labelling rules are load-bearing here: a declared amount is always shown
 * as an estimate, and a linked amount always says which valuation it came from
 * and when. A missing valuation is stated outright rather than rendered as
 * nothing owed.
 */
export function DebtInventory({
  page,
  isLoading,
  onAddDebt,
  onResolveDebt
}: DebtInventoryProps): ReactNode {
  if (isLoading && page === null) {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (page === null) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-expense/30 bg-expense/5 px-4 py-3 text-sm text-foreground-muted"
      >
        We could not load your declared debts just now. Reload the page to try again — nothing has
        been changed.
      </p>
    );
  }

  if (page.items.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-5 w-5" aria-hidden={true} />}
        title="No debts declared"
        description={
          <>
            Nothing is assumed on your behalf. Add a card balance, a BNPL plan, or a loan to keep it
            visible in planning. Anything above {highCostThresholdLabel(page.highCost.thresholdBps)}{" "}
            a year is flagged as high cost.
          </>
        }
        action={
          <Button type="button" onClick={onAddDebt}>
            Add a debt
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-muted">
        {page.highCost.highCostCount === 0
          ? `None of these are above ${highCostThresholdLabel(page.highCost.thresholdBps)} a year.`
          : `${page.highCost.highCostCount} of these carry a rate above ${highCostThresholdLabel(
              page.highCost.thresholdBps
            )} a year.`}
      </p>

      <ul className="space-y-3">
        {page.items.map((debt) => (
          <li key={debt.id}>
            <DebtRow debt={debt} onResolve={() => onResolveDebt(debt)} />
          </li>
        ))}
      </ul>

      {page.pageInfo.hasMore ? (
        <p className="text-xs text-foreground-muted">
          Showing the most recent {page.items.length} debts.
        </p>
      ) : null}
    </div>
  );
}

function DebtRow({
  debt,
  onResolve
}: Readonly<{ debt: DeclaredDebt; onResolve: () => void }>): ReactNode {
  const linked = debt.amountSource === "linked_asset";

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-foreground">{debt.name}</h3>
            <Badge variant="info">{DEBT_KIND_LABELS[debt.kind]}</Badge>
            {debt.isHighCost ? <Badge variant="problem">High cost</Badge> : null}
            {debt.isEstimate ? (
              <Badge variant="pending">Estimate</Badge>
            ) : (
              <Badge variant="accent">From linked asset</Badge>
            )}
          </div>

          <p className="font-mono text-2xs text-foreground-muted">
            {bpsToPercentLabel(debt.annualRateBps)} a year
            {debt.minimumPaymentMinor === null ? null : (
              <>
                {" · minimum payment "}
                <Money minor={debt.minimumPaymentMinor} />
              </>
            )}
          </p>

          <p className="text-xs leading-relaxed text-foreground-muted">
            {linked ? (
              <>
                {debt.linkedAssetName === null ? (
                  <>This debt is linked to an asset that is no longer available.</>
                ) : (
                  <>
                    Amount comes from the latest valuation of{" "}
                    <strong className="text-foreground">{debt.linkedAssetName}</strong>
                    {debt.valuationAsOf === null
                      ? ", which has no valuation recorded yet."
                      : `, valued on ${formatDate(debt.valuationAsOf)}.`}
                  </>
                )}
              </>
            ) : (
              <>Amount is your own estimate. Update it here whenever it changes.</>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <div className="text-right">
            <p className="font-mono text-2xs tracking-wider text-foreground-muted uppercase">
              Outstanding
            </p>
            {debt.outstandingMinor === null ? (
              <p className="text-sm font-semibold text-foreground-muted">Not known</p>
            ) : (
              <p className="text-base font-bold text-foreground">
                <Money minor={debt.outstandingMinor} />
              </p>
            )}
          </div>

          <Button type="button" variant="secondary" onClick={onResolve}>
            Resolve
          </Button>
        </div>
      </div>

      {linked ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2.5 font-mono text-2xs text-foreground-muted">
          <Link2 className="h-3 w-3" aria-hidden={true} />
          Linked debts are never given a second balance of their own.
        </p>
      ) : null}
    </article>
  );
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  });
}

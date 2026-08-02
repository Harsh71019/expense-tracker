"use client";

import type {
  Account,
  BillPaymentStatus,
  BillReconciliationStatus,
  ListBillsQuery
} from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Select, type SelectOption } from "@/components/ui";

import { serializeBillFilters } from "../model/bill-filters";

const RECONCILIATION_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "All statement states" },
  { value: "awaiting_statement", label: "Awaiting statement" },
  { value: "reconciled", label: "Reconciled" }
];

const PAYMENT_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "All payment states" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Part-paid" },
  { value: "paid", label: "Paid" }
];

export function BillFilters({
  filters,
  cards
}: Readonly<{ filters: ListBillsQuery; cards: readonly Account[] }>): ReactNode {
  const router = useRouter();

  function navigate(patch: Partial<ListBillsQuery>): void {
    const next = { ...filters, ...patch, cursor: undefined };
    const query = serializeBillFilters(next);
    router.push(query.length === 0 ? "/bills" : `/bills?${query}`);
  }

  const cardOptions: readonly SelectOption[] = [
    { value: "", label: "All cards" },
    ...cards.map((card) => ({
      value: card.id,
      label: card.name
    }))
  ];

  const activeFilterCount = [
    filters.accountId,
    filters.reconciliationStatus,
    filters.paymentStatus
  ].filter((val) => val !== undefined).length;

  const isFiltered = activeFilterCount > 0;

  function clear(): void {
    router.push("/bills");
  }

  return (
    <div
      aria-label="Bill filters"
      className={`mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border p-3 transition-colors duration-150 ${
        isFiltered
          ? "border-accent/40 bg-surface-elevated shadow-sm"
          : "border-border bg-surface-elevated"
      }`}
    >
      <Select
        aria-label="Filter by card"
        name="cardFilter"
        options={cardOptions}
        value={filters.accountId ?? ""}
        onChange={(val) => navigate({ accountId: val === "" ? undefined : val })}
      />
      <Select
        aria-label="Filter by statement status"
        name="statementStatusFilter"
        options={RECONCILIATION_OPTIONS}
        value={filters.reconciliationStatus ?? ""}
        onChange={(val) =>
          navigate({
            reconciliationStatus: val === "" ? undefined : BillReconciliationStatusValue(val)
          })
        }
      />
      <Select
        aria-label="Filter by payment status"
        name="paymentStatusFilter"
        options={PAYMENT_OPTIONS}
        value={filters.paymentStatus ?? ""}
        onChange={(val) =>
          navigate({
            paymentStatus: val === "" ? undefined : BillPaymentStatusValue(val)
          })
        }
      />

      {isFiltered ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear"
          title="Clear all filters"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-muted/60 px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-expense/40 hover:bg-expense/10 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>Clear</span>
          <span className="rounded-full bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent">
            {activeFilterCount}
          </span>
        </button>
      ) : null}

      {isFiltered ? (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          <span className="font-mono text-[10px] font-semibold text-foreground-muted uppercase">
            Active:
          </span>
          {filters.accountId !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>Card: {cards.find((c) => c.id === filters.accountId)?.name ?? "Selected"}</span>
              <button
                type="button"
                onClick={() => navigate({ accountId: undefined })}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove card filter"
              >
                ×
              </button>
            </span>
          ) : null}
          {filters.reconciliationStatus !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>Statement: {filters.reconciliationStatus.replace("_", " ")}</span>
              <button
                type="button"
                onClick={() => navigate({ reconciliationStatus: undefined })}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove statement status filter"
              >
                ×
              </button>
            </span>
          ) : null}
          {filters.paymentStatus !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>Payment: {filters.paymentStatus}</span>
              <button
                type="button"
                onClick={() => navigate({ paymentStatus: undefined })}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove payment status filter"
              >
                ×
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BillReconciliationStatusValue(value: string): BillReconciliationStatus {
  if (value === "awaiting_statement" || value === "reconciled") return value;
  throw new RangeError("Unknown reconciliation filter.");
}

function BillPaymentStatusValue(value: string): BillPaymentStatus {
  if (value === "unpaid" || value === "partial" || value === "paid") return value;
  throw new RangeError("Unknown payment filter.");
}

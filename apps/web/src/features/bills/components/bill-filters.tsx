"use client";

import type {
  Account,
  BillPaymentStatus,
  BillReconciliationStatus,
  ListBillsQuery
} from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { serializeBillFilters } from "../model/bill-filters";

const selectClasses =
  "min-h-11 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:w-auto sm:text-sm";

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

  return (
    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap" aria-label="Bill filters">
      <select
        aria-label="Filter by card"
        name="cardFilter"
        autoComplete="off"
        className={selectClasses}
        value={filters.accountId ?? ""}
        onChange={(event) =>
          navigate({ accountId: event.target.value === "" ? undefined : event.target.value })
        }
      >
        <option value="">All cards</option>
        {cards.map((card) => (
          <option key={card.id} value={card.id}>
            {card.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by statement status"
        name="statementStatusFilter"
        autoComplete="off"
        className={selectClasses}
        value={filters.reconciliationStatus ?? ""}
        onChange={(event) =>
          navigate({
            reconciliationStatus:
              event.target.value === ""
                ? undefined
                : BillReconciliationStatusValue(event.target.value)
          })
        }
      >
        <option value="">All statement states</option>
        <option value="awaiting_statement">Awaiting statement</option>
        <option value="reconciled">Reconciled</option>
      </select>
      <select
        aria-label="Filter by payment status"
        name="paymentStatusFilter"
        autoComplete="off"
        className={selectClasses}
        value={filters.paymentStatus ?? ""}
        onChange={(event) =>
          navigate({
            paymentStatus:
              event.target.value === "" ? undefined : BillPaymentStatusValue(event.target.value)
          })
        }
      >
        <option value="">All payment states</option>
        <option value="unpaid">Unpaid</option>
        <option value="partial">Part-paid</option>
        <option value="paid">Paid</option>
      </select>
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

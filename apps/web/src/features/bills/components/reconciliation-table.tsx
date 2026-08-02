"use client";

import type { BillDetail, BillStatementRowMatchStatus } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { useBillStatementRows } from "../hooks/use-bill-statement";
import { ExtraLedgerList } from "./extra-ledger-list";
import { ReconciliationRow } from "./reconciliation-row";

type Filter = "all" | BillStatementRowMatchStatus;

export function ReconciliationTable({ detail }: Readonly<{ detail: BillDetail }>): ReactNode {
  const [filter, setFilter] = useState<Filter>("all");
  const upload = detail.activeStatement;
  const filters = filter === "all" ? { limit: 50 } : { matchStatus: filter, limit: 50 };
  const rows = useBillStatementRows(detail.bill.id, filters, upload?.status === "staged");

  if (upload === undefined || upload.status !== "staged") return null;
  const items = rows.data?.pages.flatMap((page) => page.items) ?? [];
  const readOnly = detail.bill.reconciliationStatus === "reconciled";

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">Statement review</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            {detail.reconciliation.stats.matched} matched · {detail.reconciliation.unresolved}{" "}
            unresolved · {detail.reconciliation.stats.acknowledged} acknowledged
          </p>
        </div>
        <Select
          aria-label="Filter statement rows"
          name="statementRowFilter"
          options={[
            { value: "all", label: "All rows" },
            { value: "matched", label: "Matched" },
            { value: "missing_from_ledger", label: "Missing" },
            { value: "ambiguous", label: "Ambiguous" }
          ]}
          value={filter}
          onChange={(val) => setFilter(filterValue(val))}
        />
      </div>

      {rows.isPending ? (
        <p className="mt-5 text-sm text-foreground-muted">Loading statement rows…</p>
      ) : rows.isError ? (
        <p role="alert" className="mt-5 text-sm text-expense">
          {rows.error.message}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-foreground-muted">No statement rows match this filter.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((row) => (
            <ReconciliationRow
              key={row.id}
              billId={detail.bill.id}
              row={row}
              candidates={detail.reconciliation.extraTransactions}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {rows.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="secondary"
            disabled={rows.isFetchingNextPage}
            onClick={() => void rows.fetchNextPage()}
          >
            {rows.isFetchingNextPage ? "Loading…" : "Load more rows"}
          </Button>
        </div>
      ) : null}

      <ExtraLedgerList
        billId={detail.bill.id}
        upload={upload}
        transactions={detail.reconciliation.extraTransactions}
        readOnly={readOnly}
      />
    </section>
  );
}

function filterValue(value: string): Filter {
  if (
    value === "all" ||
    value === "matched" ||
    value === "missing_from_ledger" ||
    value === "ambiguous"
  ) {
    return value;
  }
  throw new RangeError("Unknown statement-row filter.");
}

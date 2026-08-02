"use client";

import { calendarDayDistance, type BillStatementRow, type Transaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";

import { useUpdateBillStatementRow } from "../hooks/use-bill-reconciliation";
import { formatBillDate } from "../model/bill-presentation";

export function ReconciliationRow({
  billId,
  row,
  candidates,
  readOnly
}: Readonly<{
  billId: string;
  row: BillStatementRow;
  candidates: readonly Transaction[];
  readOnly: boolean;
}>): ReactNode {
  const update = useUpdateBillStatementRow(billId);
  const eligible =
    row.parsed === undefined
      ? []
      : candidates.filter(
          (candidate) =>
            candidate.type === row.parsed?.type &&
            candidate.amountMinor === row.parsed.amountMinor &&
            calendarDayDistance(candidate.occurredAt, row.parsed.occurredAt) <= 1
        );
  const [selectedId, setSelectedId] = useState(eligible[0]?.id ?? "");

  async function acknowledge(): Promise<void> {
    try {
      await update.mutateAsync({ rowId: row.id, patch: { acknowledged: !row.acknowledged } });
      toast.success(row.acknowledged ? "Acknowledgement removed" : "Discrepancy acknowledged");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update this row.");
    }
  }

  async function match(): Promise<void> {
    if (selectedId === "") return;
    try {
      await update.mutateAsync({ rowId: row.id, patch: { matchedTransactionId: selectedId } });
      toast.success("Statement row matched");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not match this row.");
    }
  }

  return (
    <article className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-foreground">
            {row.parsed?.description ?? `Unparsed row ${row.rowNumber}`}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {row.parsed === undefined
              ? `CSV row ${row.rowNumber}`
              : `${formatBillDate(row.parsed.occurredAt)} · ${row.parsed.type}`}
          </p>
        </div>
        <div className="text-right">
          {row.parsed === undefined ? null : <Money minor={row.parsed.amountMinor} />}
          <p className="mt-1 font-mono text-[10px] font-bold tracking-wide text-foreground-muted uppercase">
            {row.matchStatus.replaceAll("_", " ")}
            {row.acknowledged ? " · acknowledged" : ""}
          </p>
        </div>
      </div>

      {row.problems.length === 0 ? null : (
        <ul className="mt-3 list-disc pl-5 text-xs text-expense">
          {row.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {readOnly || row.matchStatus === "matched" ? null : (
        <div className="mt-4 flex flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap sm:items-end">
          {eligible.length === 0 ? null : (
            <div className="min-w-0 flex-1 text-xs font-semibold text-foreground-muted">
              <span>Ledger candidate</span>
              <Select
                aria-label={`Ledger candidate for row ${row.rowNumber}`}
                name={`candidate-${row.rowNumber}`}
                options={eligible.map((candidate) => ({
                  value: candidate.id,
                  label: `${candidate.description} · ${formatBillDate(candidate.occurredAt)}`
                }))}
                value={selectedId}
                onChange={setSelectedId}
              />
            </div>
          )}
          {eligible.length === 0 ? null : (
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="secondary"
              disabled={update.isPending}
              onClick={() => void match()}
            >
              Match
            </Button>
          )}
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="secondary"
            disabled={update.isPending}
            aria-label={`${row.acknowledged ? "Remove acknowledgement for" : "Acknowledge"} row ${row.rowNumber}`}
            onClick={() => void acknowledge()}
          >
            {row.acknowledged ? "Undo acknowledgement" : "Acknowledge discrepancy"}
          </Button>
        </div>
      )}
    </article>
  );
}

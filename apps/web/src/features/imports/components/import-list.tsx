"use client";

import type { Account, ImportBatch } from "@vyaya/shared";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";

import { ImportBatchStatus } from "./import-batch-status";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

function dateLine(batch: ImportBatch): string {
  if (batch.committedAt !== undefined)
    return `Committed ${dateFormatter.format(batch.committedAt)}`;
  if (batch.revertedAt !== undefined) return `Reverted ${dateFormatter.format(batch.revertedAt)}`;
  return `Uploaded ${dateFormatter.format(batch.createdAt)}`;
}

type ImportListProps = Readonly<{
  batches: readonly ImportBatch[];
  accounts: readonly Account[];
  onResume: (batch: ImportBatch) => void;
  onRevert: (batch: ImportBatch) => void;
}>;

export function ImportList({ batches, accounts, onResume, onRevert }: ImportListProps): ReactNode {
  if (batches.length === 0) {
    return (
      <EmptyState
        title="No statements imported"
        description="Upload a CSV statement to review it before posting anything to your ledger."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {batches.map((batch) => {
        const account = accounts.find((item) => item.id === batch.accountId);
        return (
          <div
            key={batch.id}
            className="flex flex-wrap items-center gap-4.5 rounded-2xl border border-border bg-surface-elevated px-5.5 py-4.5 animate-fade-in"
          >
            <div className="grid h-11.5 w-11.5 shrink-0 place-items-center rounded-[11px] bg-accent-glow font-mono text-xs font-bold text-accent">
              CSV
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="truncate text-base font-semibold text-foreground">
                  {batch.filename}
                </span>
                <ImportBatchStatus status={batch.status} />
              </div>
              <p className="mt-0.5 text-[12.5px] font-medium text-foreground-muted">
                {account?.name ?? "Unavailable account"} · {dateLine(batch)}
              </p>
            </div>
            <div className="flex shrink-0 gap-6.5">
              <div className="text-right">
                <div className="font-mono text-lg font-semibold text-foreground">
                  {batch.stats.total}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">rows</div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono text-lg font-semibold ${batch.stats.duplicates > 0 ? "text-amber-500" : "text-foreground-muted"}`}
                >
                  {batch.stats.duplicates}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">dupes</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-semibold text-accent">
                  {batch.stats.committed}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">posted</div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {batch.status === "committed" ? (
                <button
                  type="button"
                  onClick={() => onRevert(batch)}
                  className="rounded-lg border border-expense/30 px-3.5 py-2 text-[13px] font-medium text-expense transition-colors duration-150 hover:bg-expense/10"
                >
                  Revert
                </button>
              ) : null}
              {batch.status === "staged" ? (
                <button
                  type="button"
                  onClick={() => onResume(batch)}
                  className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent-strong"
                >
                  Resume review
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

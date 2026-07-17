"use client";

import type { ImportBatch } from "@vyaya/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";

import { useImportBatches } from "../hooks/use-import-batches";
import { ImportBatchStatus } from "./import-batch-status";

export function ImportBatchList({
  initialBatches
}: Readonly<{ initialBatches: ImportBatch[] }>): ReactNode {
  const batches = useImportBatches(initialBatches);
  const items = batches.data ?? initialBatches;
  if (items.length === 0) {
    return (
      <EmptyState
        title="No statements imported"
        description="Upload a CSV statement to review it before posting anything to your ledger."
      />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((batch) => (
        <Link
          key={batch.id}
          href={`/imports/${batch.id}`}
          className="block rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-accent/40 hover:bg-accent/5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">{batch.filename}</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {batch.stats.total} rows · {batch.stats.duplicates} duplicates
              </p>
            </div>
            <ImportBatchStatus status={batch.status} />
          </div>
        </Link>
      ))}
      {batches.isError ? <p className="text-sm text-expense">Could not refresh imports.</p> : null}
    </div>
  );
}

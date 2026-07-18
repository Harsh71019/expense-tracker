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
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {items.map((batch) => (
          <Link
            key={batch.id}
            href={`/imports/${batch.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted/50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{batch.filename}</p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                {batch.stats.total} rows · {batch.stats.duplicates} duplicates
              </p>
            </div>
            <ImportBatchStatus status={batch.status} />
          </Link>
        ))}
      </div>
      {batches.isError ? <p className="text-sm text-expense">Could not refresh imports.</p> : null}
    </div>
  );
}

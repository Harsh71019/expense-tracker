import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  ImportBatchActions,
  ImportBatchStatus,
  StagedRowTable,
  getImportBatch,
  getStagedRows
} from "@/features/imports";

export default async function ImportPreviewPage({
  params
}: Readonly<{ params: Promise<{ batchId: string }> }>): Promise<ReactNode> {
  const { batchId } = await params;
  const [batch, firstPage] = await Promise.all([getImportBatch(batchId), getStagedRows(batchId)]);
  if (batch === undefined) notFound();
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {batch.filename}
            </h1>
            <ImportBatchStatus status={batch.status} />
          </div>
          <p className="mt-2 text-sm text-foreground-muted">
            {batch.stats.total} rows · {batch.stats.duplicates} duplicates · {batch.stats.staged}{" "}
            ready
          </p>
        </div>
        <ImportBatchActions batch={batch} />
      </div>
      <StagedRowTable batchId={batch.id} initialPage={firstPage} />
    </section>
  );
}

"use client";

import type { StagedRowPage } from "@vyaya/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { useStagedRows } from "../hooks/use-staged-rows";
import { StagedRow } from "./staged-row";

export function StagedRowTable({
  batchId,
  initialPage
}: Readonly<{ batchId: string; initialPage: StagedRowPage }>): ReactNode {
  const list = useStagedRows(batchId, initialPage);
  const rows = (list.data?.pages ?? [initialPage]).flatMap((page) => page.items);
  if (rows.length === 0)
    return (
      <EmptyState
        title="Nothing staged yet"
        description="The statement is still parsing, or it did not contain any rows to review."
      />
    );
  return (
    <section className="space-y-3">
      {rows.map((row) => (
        <StagedRow key={row.id} batchId={batchId} row={row} />
      ))}
      {list.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading rows…" : "Load more"}
          </Button>
        </div>
      ) : null}
      {list.isError ? <p className="text-sm text-expense">Could not refresh staged rows.</p> : null}
    </section>
  );
}

"use client";

import type { ImportBatch } from "@vyaya/shared";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { useCommitBatch } from "../hooks/use-commit-batch";
import { useRevertBatch } from "../hooks/use-revert-batch";

export function ImportBatchActions({ batch }: Readonly<{ batch: ImportBatch }>): ReactNode {
  const commit = useCommitBatch();
  const revert = useRevertBatch();
  const [error, setError] = useState<string>();
  async function commitBatch(): Promise<void> {
    if (!window.confirm("Commit the included rows to your ledger?")) return;
    setError(undefined);
    try {
      await commit.mutateAsync(batch.id);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not commit this import."
      );
    }
  }
  async function revertBatch(): Promise<void> {
    if (!window.confirm("Revert every transaction posted by this batch?")) return;
    setError(undefined);
    try {
      await revert.mutateAsync(batch.id);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not revert this import."
      );
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {batch.status === "staged" ? (
        <Button type="button" disabled={commit.isPending} onClick={() => void commitBatch()}>
          {commit.isPending ? "Committing…" : "Commit import"}
        </Button>
      ) : null}
      {batch.status === "committed" ? (
        <Button
          type="button"
          variant="secondary"
          disabled={revert.isPending}
          onClick={() => void revertBatch()}
        >
          {revert.isPending ? "Reverting…" : "Revert batch"}
        </Button>
      ) : null}
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
    </div>
  );
}

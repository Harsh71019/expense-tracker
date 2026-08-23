"use client";

import type { ColumnMapping, ImportBatch } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import { useCommitBatch } from "../hooks/use-commit-batch";
import { useDeleteBatch } from "../hooks/use-delete-batch";
import { useImportBatches } from "../hooks/use-import-batches";
import { useRevertBatch } from "../hooks/use-revert-batch";
import { useUploadImport } from "../hooks/use-upload-import";
import { CommitConfirmDialog } from "./commit-confirm-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { ImportList } from "./import-list";
import { ImportStepper } from "./import-stepper";
import { MapStep } from "./map-step";
import { ReviewStep } from "./review-step";
import { RevertConfirmDialog } from "./revert-confirm-dialog";
import { UploadStep } from "./upload-step";

type WizardStep = 0 | 1 | 2;

export function ImportWizard({
  initialBatches
}: Readonly<{ initialBatches: ImportBatch[] }>): ReactNode {
  const batchesQuery = useImportBatches(initialBatches);
  const accounts = useAccounts();
  const categories = useCategories();
  const upload = useUploadImport();
  const commit = useCommitBatch();
  const revert = useRevertBatch();
  const deleteBatch = useDeleteBatch();

  const [view, setView] = useState<"list" | "wizard">("list");
  const [step, setStep] = useState<WizardStep>(0);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File>();
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [mappingError, setMappingError] = useState<string>();
  const [currentBatch, setCurrentBatch] = useState<ImportBatch>();
  const [includedCount, setIncludedCount] = useState(0);
  const [commitOpen, setCommitOpen] = useState(false);
  const [revertTarget, setRevertTarget] = useState<ImportBatch>();
  const [deleteTarget, setDeleteTarget] = useState<ImportBatch>();

  const batches = batchesQuery.data ?? initialBatches;
  const accountItems = accounts.data ?? [];
  const categoryItems = categories.data ?? [];
  const accountName = accountItems.find((account) => account.id === accountId)?.name ?? "";

  function startWizard(): void {
    setView("wizard");
    setStep(0);
    setAccountId("");
    setFile(undefined);
    setMapping(undefined);
    setMappingError(undefined);
    setCurrentBatch(undefined);
    setIncludedCount(0);
  }

  function resumeBatch(batch: ImportBatch): void {
    setView("wizard");
    setStep(2);
    setAccountId(batch.accountId);
    setCurrentBatch(batch);
  }

  function back(): void {
    if (step === 0) {
      setView("list");
      return;
    }
    if (step === 1) {
      setStep(0);
      return;
    }
    setView("list");
  }

  async function next(): Promise<void> {
    if (step === 0) {
      if (accountId === "" || file === undefined) return;
      setStep(1);
      return;
    }
    if (mapping === undefined || file === undefined) return;
    try {
      const batch = await upload.mutateAsync({ file, accountId, mapping });
      setCurrentBatch(batch);
      if (batch.status === "staged") {
        setStep(2);
        toast.success("Statement staged for review");
      } else {
        setView("list");
        toast.success("Statement queued for parsing");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not upload this statement");
    }
  }

  async function doCommit(): Promise<void> {
    if (currentBatch === undefined) return;
    try {
      const batch = await commit.mutateAsync(currentBatch.id);
      setCommitOpen(false);
      setView("list");
      toast.success(
        batch.status === "committed" ? "Import committed to the ledger" : "Import queued to commit"
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not commit this import");
    }
  }

  async function doRevert(): Promise<void> {
    if (revertTarget === undefined) return;
    try {
      const batch = await revert.mutateAsync(revertTarget.id);
      setRevertTarget(undefined);
      toast.success(batch.status === "reverted" ? "Import reversed" : "Import queued to revert");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not revert this import");
    }
  }

  async function doDelete(): Promise<void> {
    if (deleteTarget === undefined) return;
    try {
      await deleteBatch.mutateAsync(deleteTarget.id);
      setDeleteTarget(undefined);
      toast.success("Import deleted");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete this import");
    }
  }

  const canLeaveUpload = accountId !== "" && file !== undefined;
  const canLeaveMap = mapping !== undefined;
  const nextEnabled = step === 0 ? canLeaveUpload : canLeaveMap;
  const backLabel = step === 0 ? "Cancel" : step === 1 ? "Back" : "Save & exit";

  return (
    <section className="space-y-4.5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {view === "wizard" ? "New import" : "Imports"}
          </h1>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {view === "wizard"
              ? "Parse columns, map categories, and stage statement rows."
              : "Statement CSV staging, reviews, and batch revert management."}
          </p>
        </div>
        {view === "list" ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/portfolio-import">
              <Button type="button" variant="secondary">
                Import CAS PDF Statement
              </Button>
            </Link>
            <Button type="button" onClick={startWizard}>
              <span className="mr-1 text-base leading-none">+</span> New import
            </Button>
          </div>
        ) : null}
      </header>

      {view === "list" ? (
        <div className="mt-6">
          <ImportList
            batches={batches}
            accounts={accountItems}
            onResume={resumeBatch}
            onRevert={setRevertTarget}
            onDelete={setDeleteTarget}
          />
          {batchesQuery.isError ? (
            <p className="mt-3 text-sm text-expense">Could not refresh imports.</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6">
          <ImportStepper step={step} />

          {step === 0 ? (
            <UploadStep
              accounts={accountItems}
              accountId={accountId}
              onAccountChange={setAccountId}
              file={file}
              onFileChange={setFile}
            />
          ) : null}

          {step === 1 ? (
            <MapStep
              accountId={accountId}
              accountName={accountName}
              onChange={(nextMapping, nextError) => {
                setMapping(nextMapping);
                setMappingError(nextError);
              }}
            />
          ) : null}

          {step === 2 && currentBatch !== undefined ? (
            <ReviewStep
              batchId={currentBatch.id}
              categories={categoryItems}
              onCountsChange={setIncludedCount}
            />
          ) : null}

          {mappingError === undefined || step !== 1 ? null : (
            <p className="mt-3 text-sm text-expense">{mappingError}</p>
          )}

          <div className="mt-5.5 flex items-center gap-3">
            <button
              type="button"
              onClick={back}
              className="rounded-lg border border-border bg-surface-muted px-4.5 py-2.5 text-sm font-medium text-foreground"
            >
              {backLabel}
            </button>
            <div className="flex-1" />
            {step < 2 ? (
              <Button
                type="button"
                disabled={!nextEnabled || upload.isPending}
                onClick={() => void next()}
              >
                {upload.isPending ? "Uploading…" : step === 0 ? "Map columns →" : "Review rows →"}
              </Button>
            ) : (
              <Button type="button" onClick={() => setCommitOpen(true)}>
                Commit {includedCount} transactions
              </Button>
            )}
          </div>
        </div>
      )}

      {commitOpen ? (
        <CommitConfirmDialog
          includedCount={includedCount}
          isPending={commit.isPending}
          onCancel={() => setCommitOpen(false)}
          onConfirm={() => void doCommit()}
        />
      ) : null}

      {revertTarget === undefined ? null : (
        <RevertConfirmDialog
          batch={revertTarget}
          isPending={revert.isPending}
          onCancel={() => setRevertTarget(undefined)}
          onConfirm={() => void doRevert()}
        />
      )}

      {deleteTarget === undefined ? null : (
        <DeleteConfirmDialog
          batch={deleteTarget}
          isPending={deleteBatch.isPending}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void doDelete()}
        />
      )}
    </section>
  );
}

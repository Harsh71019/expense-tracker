"use client";

import type { ColumnMapping, ImportBatch } from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import { useCommitBatch } from "../hooks/use-commit-batch";
import { useImportBatches } from "../hooks/use-import-batches";
import { useRevertBatch } from "../hooks/use-revert-batch";
import { useUploadImport } from "../hooks/use-upload-import";
import { CommitConfirmDialog } from "./commit-confirm-dialog";
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
      setStep(2);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not upload this statement");
    }
  }

  async function doCommit(): Promise<void> {
    if (currentBatch === undefined) return;
    try {
      await commit.mutateAsync(currentBatch.id);
      setCommitOpen(false);
      setView("list");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not commit this import");
    }
  }

  async function doRevert(): Promise<void> {
    if (revertTarget === undefined) return;
    try {
      await revert.mutateAsync(revertTarget.id);
      setRevertTarget(undefined);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not revert this import");
    }
  }

  const canLeaveUpload = accountId !== "" && file !== undefined;
  const canLeaveMap = mapping !== undefined;
  const nextEnabled = step === 0 ? canLeaveUpload : canLeaveMap;
  const backLabel = step === 0 ? "Cancel" : step === 1 ? "Back" : "Save & exit";

  return (
    <section>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">
            LEDGER · IMPORT
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {view === "wizard" ? "New import" : "Imports"}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            {view === "wizard"
              ? "Turn a bank CSV into posted transactions. Nothing is final until the commit step."
              : "Bring in a bank statement CSV. Review every row in a safe sandbox, then commit — and revert the whole batch if you need to."}
          </p>
        </div>
        {view === "list" ? (
          <Button type="button" onClick={startWizard}>
            <span className="mr-1 text-base leading-none">+</span> New import
          </Button>
        ) : null}
      </header>

      {view === "list" ? (
        <div className="mt-6">
          <ImportList
            batches={batches}
            accounts={accountItems}
            onResume={resumeBatch}
            onRevert={setRevertTarget}
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
    </section>
  );
}

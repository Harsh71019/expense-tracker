"use client";

import {
  formatMinor,
  formatMicroUnits,
  formatPricePerUnit,
  MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES,
  type Asset,
  type PortfolioImportBatch,
  type PortfolioImportRow,
  type PortfolioImportRowAction
} from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  RotateCcw,
  Trash2,
  Upload
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import {
  useCommitPortfolioImportBatch,
  useDeletePortfolioImportBatch,
  usePortfolioImportBatch,
  usePortfolioImportBatches,
  usePortfolioImportRows,
  useRevertPortfolioImportBatch,
  useUpdatePortfolioImportRow,
  useUploadPortfolioImport
} from "../hooks/use-portfolio-imports";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type WizardProps = Readonly<{
  userAssets: readonly Asset[];
}>;

export function PortfolioImportWizard({ userAssets }: WizardProps): ReactNode {
  const [activeBatchId, setActiveBatchId] = useState<string>();
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PortfolioImportBatch>();

  const batchesQuery = usePortfolioImportBatches();
  const activeBatchQuery = usePortfolioImportBatch(activeBatchId);
  const rowsQuery = usePortfolioImportRows(activeBatchId);

  const uploadMutation = useUploadPortfolioImport();
  const updateRowMutation = useUpdatePortfolioImportRow();
  const commitMutation = useCommitPortfolioImportBatch();
  const deleteMutation = useDeletePortfolioImportBatch();
  const revertMutation = useRevertPortfolioImportBatch();

  const activeBatch = activeBatchQuery.data;
  const rows = rowsQuery.data?.items ?? [];

  async function handleUpload(): Promise<void> {
    if (file === undefined) {
      toast.error("Please select a CAS PDF statement");
      return;
    }
    try {
      const batch = await uploadMutation.mutateAsync({
        file,
        metadata: {
          password: password.trim() !== "" ? password.trim() : undefined,
          source: "kfintech_cams"
        }
      });
      setActiveBatchId(batch.id);
      setPassword("");
      toast.success("Statement uploaded. Processing statement...");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload statement";
      toast.error(message);
    }
  }

  async function handleCommit(): Promise<void> {
    if (activeBatchId === undefined) return;
    try {
      await commitMutation.mutateAsync(activeBatchId);
      toast.success("Portfolio import committed successfully!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to commit import";
      toast.error(message);
    }
  }

  async function handleRevert(batchId: string): Promise<void> {
    try {
      await revertMutation.mutateAsync(batchId);
      toast.success("Portfolio import reverted via compensating entries.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to revert import";
      toast.error(message);
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleteTarget === undefined) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if (activeBatchId === deleteTarget.id) setActiveBatchId(undefined);
      setDeleteTarget(undefined);
      toast.success("Statement deleted. You can upload it again now.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete statement";
      toast.error(message);
    }
  }

  function handleFileDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped !== undefined) {
      if (!dropped.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Only PDF CAS statements are supported");
        return;
      }
      if (dropped.size > MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES) {
        toast.error("Statement exceeds 5 MB limit");
        return;
      }
      setFile(dropped);
    }
  }

  const assetOptions = [
    { value: "", label: "Create new asset" },
    ...userAssets.map((a) => ({ value: a.id, label: a.name }))
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/assets"
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Assets
            </Link>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl mt-1">
            CAS Portfolio Import
          </h1>
          <p className="text-xs text-foreground-muted">
            Import mutual fund holdings and transactions from CAMS / KFintech Consolidated Account
            Statements.
          </p>
        </div>
        {activeBatchId !== undefined && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setActiveBatchId(undefined);
              setFile(undefined);
            }}
          >
            + Upload New Statement
          </Button>
        )}
      </header>

      {activeBatchId === undefined ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-6 space-y-5">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-accent bg-accent/5"
                : file !== undefined
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border hover:border-foreground-muted/40 hover:bg-surface-muted/30"
            }`}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const picked = e.target.files?.[0];
                if (picked !== undefined) {
                  if (picked.size > MAX_PORTFOLIO_IMPORT_FILE_SIZE_BYTES) {
                    toast.error("Statement exceeds 5 MB limit");
                    return;
                  }
                  setFile(picked);
                }
              }}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
              {file !== undefined ? (
                <FileText className="h-6 w-6 text-emerald-500" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              {file !== undefined ? file.name : "Drop your CAS PDF statement here, or browse"}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              Supports CAMS / KFintech monthly and detailed Consolidated Account Statements (Max 5
              MB)
            </p>
          </label>

          <div className="grid gap-2 max-w-md">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>PDF Password (if protected)</span>
              <span className="text-foreground-muted font-normal">Usually your PAN or DOB</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="e.g. ABCDE1234F or DDMMYYYY"
                className="w-full rounded-xl border border-border bg-surface-muted/50 px-3.5 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-foreground-muted flex items-center gap-1 mt-0.5">
              <Lock className="h-3 w-3" /> Password is used only to decrypt in memory and is never
              logged or stored.
            </p>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              disabled={file === undefined || uploadMutation.isPending}
              onClick={handleUpload}
              className="w-full sm:w-auto"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading &amp; Encrypting...
                </>
              ) : (
                "Parse & Review Statement"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Active Batch Banner */}
          <div className="rounded-2xl border border-border bg-surface-elevated p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">
                    Statement: {activeBatch?.filename ?? "Processing..."}
                  </h2>
                  {activeBatch && <BatchStatusBadge status={activeBatch.status} />}
                </div>
                {activeBatch?.statementAsOf && (
                  <p className="text-xs text-foreground-muted mt-0.5">
                    As of: {dateFormatter.format(new Date(activeBatch.statementAsOf))}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(activeBatch?.status === "ready" || activeBatch?.status === "needs_review") && (
                  <Button type="button" disabled={commitMutation.isPending} onClick={handleCommit}>
                    {commitMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Committing...
                      </>
                    ) : (
                      `Commit ${activeBatch.includedCount} Rows to Portfolio`
                    )}
                  </Button>
                )}
                {activeBatch?.status === "completed" && (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={revertMutation.isPending}
                    onClick={() => handleRevert(activeBatch.id)}
                  >
                    {revertMutation.isPending ? "Reverting..." : "Revert Import"}
                  </Button>
                )}
                {activeBatch !== undefined && isDiscardableStatus(activeBatch.status) && (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={deleteMutation.isPending}
                    onClick={() => setDeleteTarget(activeBatch)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete Import
                  </Button>
                )}
              </div>
            </div>

            {(activeBatch?.status === "queued" || activeBatch?.status === "parsing") && (
              <div className="flex items-center gap-2 text-sm text-foreground-muted py-4">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span>Reading PDF text stream and matching fund schemes with AMFI catalog...</span>
              </div>
            )}

            {activeBatch?.status === "failed" && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Statement parsing failed</p>
                  <p className="mt-0.5">
                    {activeBatch.failureCode === "cas_password_invalid"
                      ? "Password incorrect. Please check your PAN/DOB and try uploading again."
                      : activeBatch.failureCode === "unsupported_scanned_statement"
                        ? "Scanned or image-only PDFs are not supported. Please upload an original text statement."
                        : `Error: ${activeBatch.failureCode ?? "Unknown error"}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Staged Rows Review Table */}
          {rows.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface-elevated overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Parsed Holdings &amp; Transactions ({rows.length})
                </h3>
                <span className="text-xs text-foreground-muted">
                  Review matched assets and actions before committing
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted/60 border-b border-border text-foreground-muted font-medium">
                    <tr>
                      <th className="p-3 w-10 text-center">Inc</th>
                      <th className="p-3">Scheme &amp; Folio</th>
                      <th className="p-3">ISIN / Code</th>
                      <th className="p-3 text-right">Units</th>
                      <th className="p-3 text-right">NAV (₹)</th>
                      <th className="p-3 text-right">Amount (₹)</th>
                      <th className="p-3">Match Status</th>
                      <th className="p-3">Target Asset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <RowItem
                        key={row.id}
                        row={row}
                        assetOptions={assetOptions}
                        onUpdate={(update) => {
                          if (activeBatchId !== undefined) {
                            void updateRowMutation.mutateAsync({
                              batchId: activeBatchId,
                              rowId: row.id,
                              update
                            });
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Past Batches History */}
      {batchesQuery.data !== undefined && batchesQuery.data.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-5 space-y-3 mt-8">
          <h3 className="text-sm font-semibold text-foreground">Past CAS Statements</h3>
          <div className="divide-y divide-border">
            {batchesQuery.data.map((batch) => (
              <div
                key={batch.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveBatchId(batch.id)}
                      className="font-medium text-foreground hover:text-accent underline text-left"
                    >
                      {batch.filename}
                    </button>
                    <BatchStatusBadge status={batch.status} />
                  </div>
                  <p className="text-foreground-muted mt-0.5">
                    Uploaded {dateFormatter.format(new Date(batch.createdAt))} • {batch.rowCount}{" "}
                    rows
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveBatchId(batch.id)}
                  >
                    View Details
                  </Button>
                  {batch.status === "completed" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={revertMutation.isPending}
                      onClick={() => handleRevert(batch.id)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Revert
                    </Button>
                  )}
                  {isDiscardableStatus(batch.status) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteTarget(batch)}
                      className="text-expense hover:text-expense"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deleteTarget !== undefined && (
        <DeletePortfolioImportDialog
          batch={deleteTarget}
          isPending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

function isDiscardableStatus(status: PortfolioImportBatch["status"]): boolean {
  return (
    status === "queued" ||
    status === "parsing" ||
    status === "needs_review" ||
    status === "ready" ||
    status === "failed"
  );
}

function DeletePortfolioImportDialog({
  batch,
  isPending,
  onCancel,
  onConfirm
}: Readonly<{
  batch: PortfolioImportBatch;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>): ReactNode {
  return (
    <DialogSurface
      labelledBy="delete-portfolio-import-title"
      describedBy="delete-portfolio-import-description"
      role="alertdialog"
      onClose={onCancel}
    >
      <h2 id="delete-portfolio-import-title" className="text-lg font-bold text-foreground">
        Delete this CAS import?
      </h2>
      <p
        id="delete-portfolio-import-description"
        className="mt-2 text-sm leading-relaxed text-foreground-muted"
      >
        This permanently removes <strong className="text-foreground">{batch.filename}</strong> and
        its uncommitted review rows. It does not delete portfolio assets or committed position
        history. You can upload the same statement again immediately.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="danger" disabled={isPending} onClick={onConfirm}>
          {isPending ? "Deleting..." : "Delete import"}
        </Button>
      </div>
    </DialogSurface>
  );
}

function RowItem({
  row,
  assetOptions,
  onUpdate
}: Readonly<{
  row: PortfolioImportRow;
  assetOptions: readonly { value: string; label: string }[];
  onUpdate: (update: {
    proposedAssetId?: string | null;
    proposedAction?: PortfolioImportRowAction;
    include?: boolean;
  }) => void;
}>): ReactNode {
  return (
    <tr className={!row.include ? "opacity-40 bg-surface-muted/20" : ""}>
      <td className="p-3 text-center">
        <input
          type="checkbox"
          checked={row.include}
          onChange={(e) => onUpdate({ include: e.target.checked })}
          className="rounded border-border text-accent focus:ring-accent"
        />
      </td>
      <td className="p-3 max-w-xs">
        <p className="font-medium text-foreground truncate">{row.displayName}</p>
        <p className="text-[11px] text-foreground-muted">
          Folio: {row.folioReferenceMasked ?? "N/A"} • {row.rowKind}
        </p>
      </td>
      <td className="p-3 text-foreground-muted font-mono text-[11px]">
        {row.isin ?? row.schemeCode ?? "—"}
      </td>
      <td className="p-3 text-right font-mono text-foreground">
        {row.quantityMicroUnits !== null ? formatMicroUnits(row.quantityMicroUnits) : "—"}
      </td>
      <td className="p-3 text-right font-mono text-foreground">
        {row.navMicroRupeesPerUnit !== undefined
          ? `₹${formatPricePerUnit(row.navMicroRupeesPerUnit)}`
          : "—"}
      </td>
      <td className="p-3 text-right font-mono text-foreground font-semibold">
        {row.grossAmountMinor !== undefined ? `₹${formatMinor(row.grossAmountMinor)}` : "—"}
      </td>
      <td className="p-3">
        <RowMatchBadge status={row.matchStatus} />
      </td>
      <td className="p-3 min-w-44">
        <select
          value={row.proposedAssetId ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate({
              proposedAssetId: val !== "" ? val : null,
              proposedAction: val !== "" ? "append_event" : "create_asset"
            });
          }}
          className="w-full rounded-lg border border-border bg-surface-muted/60 px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          {assetOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function BatchStatusBadge({
  status
}: Readonly<{ status: PortfolioImportBatch["status"] }>): ReactNode {
  switch (status) {
    case "completed":
      return <Badge variant="success">Committed</Badge>;
    case "ready":
      return <Badge variant="accent">Ready to Commit</Badge>;
    case "needs_review":
      return <Badge variant="pending">Needs Review</Badge>;
    case "parsing":
    case "queued":
    case "committing":
      return <Badge variant="pending">Processing</Badge>;
    case "reverting":
    case "reverted":
      return <Badge variant="reversed">Reverted</Badge>;
    case "failed":
      return <Badge variant="problem">Failed</Badge>;
    default:
      return <Badge variant="info">{status}</Badge>;
  }
}

function RowMatchBadge({
  status
}: Readonly<{ status: PortfolioImportRow["matchStatus"] }>): ReactNode {
  switch (status) {
    case "matched":
      return <Badge variant="success">Matched</Badge>;
    case "needs_confirmation":
      return <Badge variant="pending">Candidate</Badge>;
    case "unmatched":
      return <Badge variant="accent">New Asset</Badge>;
    case "ignored":
      return <Badge variant="info">Ignored</Badge>;
    default:
      return <Badge variant="info">{status}</Badge>;
  }
}

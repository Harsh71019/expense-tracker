"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  formatSignedCompactMinor,
  type Category,
  type StagedRow,
  type StagedRowPage
} from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { qk } from "@/lib/query/keys";
import { toast } from "@/lib/toast";

import { useStagedRows } from "../hooks/use-staged-rows";
import { useImportReconciliation } from "../hooks/use-import-reconciliation";
import { useUpdateStagedRow } from "../hooks/use-update-staged-row";

const EMPTY_PAGE: StagedRowPage = {
  items: [],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type ReviewStepProps = Readonly<{
  batchId: string;
  categories: readonly Category[];
  onCountsChange: (includedCount: number) => void;
  reconciliationEnabled?: boolean;
  onReconciliationReady?: (ready: boolean) => void;
}>;

export function ReviewStep({
  batchId,
  categories,
  onCountsChange,
  reconciliationEnabled = true,
  onReconciliationReady
}: ReviewStepProps): ReactNode {
  const queryClient = useQueryClient();
  const list = useStagedRows(batchId, EMPTY_PAGE);
  const reconciliation = useImportReconciliation(batchId, reconciliationEnabled);
  const update = useUpdateStagedRow();
  const [editedRowIds, setEditedRowIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: qk.importPreview(batchId) });
    setEditedRowIds(new Set());
  }, [batchId, queryClient]);

  const rows = (list.data?.pages ?? [EMPTY_PAGE]).flatMap((page) => page.items);
  const total = rows.length;
  const included = rows.filter((row) => row.include).length;
  const duplicates = rows.filter((row) => row.isDuplicate).length;
  const problems = rows.filter((row) => row.problems.length > 0).length;

  useEffect(() => {
    onCountsChange(included);
  }, [included, onCountsChange]);

  useEffect(() => {
    onReconciliationReady?.(!reconciliationEnabled || reconciliation.data?.reconciled === true);
  }, [onReconciliationReady, reconciliation.data?.reconciled, reconciliationEnabled]);

  function toggleInclude(row: StagedRow): void {
    update.mutate(
      { batchId, stagedRowId: row.id, include: !row.include },
      {
        onSuccess: () => {
          toast.success(row.include ? "Row excluded from import" : "Row included in import", {
            id: `import-row-${row.id}`
          });
        },
        onError: (error) => {
          toast.error(error.message || "Could not update this row", {
            id: `import-row-${row.id}`
          });
        }
      }
    );
  }

  function setCategory(row: StagedRow, categoryId: string): void {
    setEditedRowIds((current) => new Set(current).add(row.id));
    update.mutate(
      {
        batchId,
        stagedRowId: row.id,
        suggestedCategoryId: categoryId === "" ? null : categoryId
      },
      {
        onSuccess: () => {
          toast.success("Row category updated", { id: `import-row-${row.id}` });
        },
        onError: (error) => {
          toast.error(error.message || "Could not update this row", {
            id: `import-row-${row.id}`
          });
        }
      }
    );
  }

  function acceptSuggestedMatch(row: StagedRow): void {
    const result = row.nearDuplicateResult;
    if (result === undefined || result.outcome === "abstained") return;
    const transactionId =
      result.outcome === "match"
        ? result.evidence.candidateTransactionId
        : result.topEvidence.candidateTransactionId;
    update.mutate(
      { batchId, stagedRowId: row.id, matchedTransactionId: transactionId },
      {
        onSuccess: () => toast.success("Statement row matched to the ledger"),
        onError: (error) => toast.error(error.message || "Could not match this row")
      }
    );
  }

  return (
    <>
      {reconciliation.data === undefined ? null : (
        <div className="mt-5.5 animate-fade-in rounded-2xl border border-border bg-surface-elevated p-4 sm:px-6.5 sm:py-5.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Balance reconciliation</h2>
              <p className="mt-1 text-xs text-foreground-muted">
                {reconciliation.data.periodFrom} through {reconciliation.data.periodThrough}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${reconciliation.data.reconciled ? "bg-income/10 text-income" : "bg-warning/10 text-warning"}`}
            >
              {reconciliation.data.reconciled ? "Ready to reconcile" : "Needs review"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <BalanceMetric
              label="Statement opening"
              value={reconciliation.data.statementOpeningBalanceMinor}
            />
            <BalanceMetric
              label="Ledger opening"
              value={reconciliation.data.ledgerOpeningBalanceMinor}
            />
            <BalanceMetric
              label="Statement closing"
              value={reconciliation.data.statementClosingBalanceMinor}
            />
            <BalanceMetric
              label="Projected ledger closing"
              value={reconciliation.data.projectedClosingBalanceMinor}
            />
          </div>
          <p
            className={`mt-4 border-t border-border pt-3 text-sm ${reconciliation.data.closingDifferenceMinor === 0 ? "text-income" : "text-warning"}`}
          >
            Closing difference:{" "}
            {reconciliation.data.closingDifferenceMinor === undefined
              ? "Unavailable"
              : formatSignedCompactMinor(reconciliation.data.closingDifferenceMinor)}{" "}
            · {reconciliation.data.matchedRows} matched · {reconciliation.data.rowsToAdd} to add ·{" "}
            {reconciliation.data.rowsNeedingReview} need review
          </p>
          {!reconciliation.data.balanceChainValid ? (
            <p className="mt-2 text-xs text-expense">
              The statement running-balance chain has a gap or an invalid balance cell.
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-5.5 animate-fade-in rounded-2xl border border-border bg-surface-elevated p-4 sm:px-6.5 sm:py-5.5">
        <div className="grid grid-cols-2 gap-5 sm:flex sm:flex-wrap sm:gap-8">
          <div>
            <div className="font-mono text-3xl font-bold tracking-tight text-foreground">
              {total}
            </div>
            <div className="mt-0.5 text-2xs font-medium text-foreground-muted">total rows</div>
          </div>
          <div>
            <div className="font-mono text-3xl font-bold tracking-tight text-accent">
              {included}
            </div>
            <div className="mt-0.5 text-2xs font-medium text-foreground-muted">will post</div>
          </div>
          <div>
            <div className="font-mono text-3xl font-bold tracking-tight text-warning">
              {duplicates}
            </div>
            <div className="mt-0.5 text-2xs font-medium text-foreground-muted">
              flagged duplicate
            </div>
          </div>
          <div>
            <div
              className={`font-mono text-3xl font-bold tracking-tight ${problems > 0 ? "text-expense" : "text-foreground-muted"}`}
            >
              {problems}
            </div>
            <div className="mt-0.5 text-2xs font-medium text-foreground-muted">
              can&apos;t parse
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-4 text-[13px] text-foreground-muted">
          Nothing posts until you commit. Toggle rows off, or change a suggested category, freely.
        </p>
      </div>

      <div className="mt-3.5 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
        <div className="hidden items-center gap-3.5 border-b border-border px-5 py-3 font-mono text-2xs font-semibold tracking-wider text-foreground-muted uppercase md:flex">
          <div className="w-4" />
          <div className="w-24">Date</div>
          <div className="flex-1">Description</div>
          <div className="w-32 text-right">Amount</div>
          <div className="w-44">Category</div>
        </div>

        {list.isFetching && rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-foreground-muted">Loading rows…</p>
        ) : null}

        {!list.isFetching && rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-foreground-muted">
            Nothing staged yet. The statement is still parsing, or it did not contain any rows to
            review.
          </p>
        ) : null}

        {rows.map((row) => {
          const parsed = row.parsed;
          const categoryOptions = categories.filter((category) => category.kind === parsed?.type);
          const suggestion = row.categorySuggestion;
          const showingSuggestion =
            suggestion !== undefined &&
            suggestion.categoryId === row.suggestedCategoryId &&
            !editedRowIds.has(row.id);
          return (
            <div
              key={row.id}
              className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-t border-border p-4 md:flex md:items-center md:gap-3.5 md:px-5 md:py-3.5 ${parsed === undefined ? "opacity-60" : ""} ${row.isDuplicate ? "bg-warning/5" : ""}`}
            >
              <label className="col-start-1 row-span-3 grid h-11 w-11 cursor-pointer place-items-center rounded-lg hover:bg-surface-muted focus-within:ring-2 focus-within:ring-accent md:h-auto md:w-4">
                <span className="sr-only">Include row {row.rowNumber}</span>
                <input
                  type="checkbox"
                  checked={row.include}
                  disabled={parsed === undefined || update.isPending}
                  onChange={() => toggleInclude(row)}
                  aria-label={`Include row ${row.rowNumber}`}
                  className="h-5 w-5 accent-accent md:h-4.5 md:w-4.5"
                />
              </label>
              <div className="col-start-2 row-start-2 font-mono text-xs text-foreground-muted md:w-24 md:text-[13px]">
                {parsed === undefined ? "—" : dateFormatter.format(parsed.occurredAt)}
              </div>
              <div className="col-start-2 col-end-4 row-start-1 min-w-0 md:flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {parsed === undefined
                    ? Object.entries(row.raw)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(" · ")
                    : parsed.description}
                </div>
                {row.isDuplicate || row.problems.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {row.isDuplicate ? (
                      <span className="rounded-[5px] border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-warning uppercase">
                        Likely duplicate
                      </span>
                    ) : null}
                    {row.problems.map((problem) => (
                      <span
                        key={problem}
                        className="rounded-[5px] border border-expense/30 bg-expense/10 px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-expense uppercase"
                      >
                        ⚠ {problem}
                      </span>
                    ))}
                  </div>
                ) : null}
                {row.matchedTransactionId !== undefined ? (
                  <p className="mt-1 text-2xs font-semibold text-income">
                    Matched to an existing ledger transaction
                  </p>
                ) : row.nearDuplicateResult !== undefined &&
                  row.nearDuplicateResult.outcome !== "abstained" ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-2xs font-semibold text-warning">
                      {row.nearDuplicateResult.outcome === "ambiguous"
                        ? "Possible ledger match"
                        : "Likely ledger match"}
                    </span>
                    <button
                      type="button"
                      disabled={update.isPending}
                      onClick={() => acceptSuggestedMatch(row)}
                      className="rounded-md border border-warning/30 px-2 py-1 text-2xs font-semibold text-warning hover:bg-warning/10"
                    >
                      Use ledger match
                    </button>
                    <span className="text-2xs text-foreground-muted">
                      or tick the row to add it
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="col-start-3 row-start-2 text-right md:w-32">
                {parsed === undefined ? (
                  <span className="font-mono text-sm text-foreground-muted/50">—</span>
                ) : (
                  <Money minor={parsed.amountMinor} variant={parsed.type} signed size="sm" />
                )}
              </div>
              <div className="col-start-2 col-end-4 row-start-3 md:w-44">
                {parsed === undefined ? (
                  <span className="font-mono text-sm text-foreground-muted/50">—</span>
                ) : (
                  <>
                    <Select
                      value={row.suggestedCategoryId ?? ""}
                      disabled={update.isPending}
                      onChange={(val) => setCategory(row, val)}
                      aria-label={`Category for row ${row.rowNumber}`}
                      options={[
                        { value: "", label: "Uncategorized" },
                        ...categoryOptions.map((category) => ({
                          value: category.id,
                          label: category.name
                        }))
                      ]}
                      placeholder="Uncategorized"
                    />
                    {showingSuggestion ? (
                      <p className="mt-1 text-2xs font-medium text-accent">
                        ✦ {suggestionLabel(suggestion.method)} ·{" "}
                        {formatConfidenceBps(suggestion.confidenceBps)} confidence ·{" "}
                        {suggestion.evidenceCount}{" "}
                        {suggestion.evidenceCount === 1 ? "example" : "examples"} · v
                        {suggestion.algorithmVersion}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {list.hasNextPage ? (
          <div className="flex justify-center border-t border-border py-3.5">
            <button
              type="button"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
              className="min-h-11 rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {list.isFetchingNextPage ? "Loading rows…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function BalanceMetric({
  label,
  value
}: Readonly<{ label: string; value: number | undefined }>): ReactNode {
  return (
    <div>
      <div className="font-mono text-base font-semibold text-foreground">
        {value === undefined ? "—" : formatSignedCompactMinor(value)}
      </div>
      <div className="mt-0.5 text-2xs text-foreground-muted">{label}</div>
    </div>
  );
}

function suggestionLabel(method: NonNullable<StagedRow["categorySuggestion"]>["method"]): string {
  switch (method) {
    case "explicit_rule":
      return "explicit rule";
    case "exact_counterparty":
      return "exact private history";
    case "jaro_winkler":
      return "similar private counterparty";
    case "soft_tf_idf":
      return "similar private tokens";
    case "jaccard":
      return "shared private tokens";
  }
}

function formatConfidenceBps(confidenceBps: number): string {
  const whole = Math.floor(confidenceBps / 100);
  const fraction = confidenceBps % 100;
  return fraction === 0 ? `${whole}%` : `${whole}.${String(fraction).padStart(2, "0")}%`;
}

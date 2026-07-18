"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Category, StagedRow, StagedRowPage } from "@vyaya/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { qk } from "@/lib/query/keys";

import { useStagedRows } from "../hooks/use-staged-rows";
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
}>;

export function ReviewStep({ batchId, categories, onCountsChange }: ReviewStepProps): ReactNode {
  const queryClient = useQueryClient();
  const list = useStagedRows(batchId, EMPTY_PAGE);
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

  function toggleInclude(row: StagedRow): void {
    update.mutate({ batchId, stagedRowId: row.id, include: !row.include });
  }

  function setCategory(row: StagedRow, categoryId: string): void {
    setEditedRowIds((current) => new Set(current).add(row.id));
    update.mutate({
      batchId,
      stagedRowId: row.id,
      suggestedCategoryId: categoryId === "" ? null : categoryId
    });
  }

  return (
    <>
      <div className="mt-5.5 animate-fade-in rounded-2xl border border-border bg-surface-elevated px-6.5 py-5.5">
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="font-mono text-3xl font-bold tracking-tight text-foreground">
              {total}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">total rows</div>
          </div>
          <div>
            <div className="font-mono text-3xl font-bold tracking-tight text-accent">
              {included}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">will post</div>
          </div>
          <div>
            <div className="font-mono text-3xl font-bold tracking-tight text-amber-500">
              {duplicates}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">
              flagged duplicate
            </div>
          </div>
          <div>
            <div
              className={`font-mono text-3xl font-bold tracking-tight ${problems > 0 ? "text-expense" : "text-foreground-muted"}`}
            >
              {problems}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-foreground-muted">
              can&apos;t parse
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-4 text-[13px] text-foreground-muted">
          Nothing posts until you commit. Toggle rows off, or change a suggested category, freely.
        </p>
      </div>

      <div className="mt-3.5 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
        <div className="flex items-center gap-3.5 border-b border-border px-5 py-3 font-mono text-[10px] font-semibold tracking-wider text-foreground-muted uppercase">
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
          const suggested = row.suggestedCategoryId !== undefined && !editedRowIds.has(row.id);
          return (
            <div
              key={row.id}
              className={`flex items-center gap-3.5 border-t border-border px-5 py-3.5 ${parsed === undefined ? "opacity-60" : ""} ${row.isDuplicate ? "bg-amber-500/5" : ""}`}
            >
              <div className="flex w-4 justify-center">
                <input
                  type="checkbox"
                  checked={row.include}
                  disabled={parsed === undefined || update.isPending}
                  onChange={() => toggleInclude(row)}
                  aria-label={`Include row ${row.rowNumber}`}
                  className="h-4.5 w-4.5 accent-accent"
                />
              </div>
              <div className="w-24 font-mono text-[13px] text-foreground-muted">
                {parsed === undefined ? "—" : dateFormatter.format(parsed.occurredAt)}
              </div>
              <div className="min-w-0 flex-1">
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
                      <span className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-amber-500 uppercase">
                        Likely duplicate
                      </span>
                    ) : null}
                    {row.problems.map((problem) => (
                      <span
                        key={problem}
                        className="rounded-[5px] border border-expense/30 bg-expense/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-expense uppercase"
                      >
                        ⚠ {problem}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="w-32 text-right">
                {parsed === undefined ? (
                  <span className="font-mono text-sm text-foreground-muted/50">—</span>
                ) : (
                  <Money minor={parsed.amountMinor} variant={parsed.type} signed size="sm" />
                )}
              </div>
              <div className="w-44">
                {parsed === undefined ? (
                  <span className="font-mono text-sm text-foreground-muted/50">—</span>
                ) : (
                  <>
                    <select
                      value={row.suggestedCategoryId ?? ""}
                      disabled={update.isPending}
                      onChange={(event) => setCategory(row, event.target.value)}
                      aria-label={`Category for row ${row.rowNumber}`}
                      className="w-full rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[12.5px] font-medium text-foreground"
                    >
                      <option value="">Uncategorized</option>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {suggested ? (
                      <p className="mt-1 text-[10px] font-medium text-accent">
                        ✦ suggested by rule
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
              className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-foreground"
            >
              {list.isFetchingNextPage ? "Loading rows…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

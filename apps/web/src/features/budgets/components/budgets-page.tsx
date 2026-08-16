"use client";

import type { BudgetPage, BudgetProgress, Category } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/lib/toast";

import { useArchiveBudget } from "../hooks/use-budget-mutations";
import { useBudgets } from "../hooks/use-budgets";
import { monthLabel } from "../model/presentation";
import { ArchiveBudgetDialog } from "./archive-budget-dialog";
import { BudgetCard } from "./budget-card";
import { BudgetForm } from "./budget-form";
import { BudgetOverview } from "./budget-overview";

const PAGE_SIZE = 50;

type BudgetsPageProps = Readonly<{
  initialPage: BudgetPage | null;
  categories: readonly Category[];
}>;

export function BudgetsPage({ initialPage, categories }: BudgetsPageProps): ReactNode {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BudgetProgress>();
  const [archiveTarget, setArchiveTarget] = useState<BudgetProgress>();
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("");
  const query = useBudgets({
    includeArchived,
    limit: PAGE_SIZE,
    ...(includeArchived || initialPage === null ? {} : { initialPage })
  });
  const archive = useArchiveBudget();
  const pages = query.data?.pages ?? [];
  const firstPage = pages[0] ?? (includeArchived ? undefined : (initialPage ?? undefined));
  const items = pages.flatMap((page) => {
    const pageItems = page.items;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      return pageItems.filter((progress) => progress.category.name.toLowerCase().includes(q));
    }
    return pageItems;
  });
  const expenseCategories = categories.filter(
    (category) => category.kind === "expense" && !category.isArchived
  );
  const attention = items.filter(
    (item) => item.isEffective && (item.state === "approaching" || item.state === "reached")
  );
  const onTrack = items.filter((item) => item.isEffective && item.state === "under");
  const inactive = items.filter((item) => !item.isEffective);

  function openEditor(progress?: BudgetProgress): void {
    setEditTarget(progress);
    setEditorOpen(true);
  }

  function closeEditor(): void {
    setEditorOpen(false);
    setEditTarget(undefined);
  }

  function announce(message: string): void {
    setStatus(message);
    toast.success(message);
  }

  async function confirmArchive(): Promise<void> {
    if (archiveTarget === undefined) {
      return;
    }
    try {
      await archive.mutateAsync(archiveTarget.budget.id);
      const message = `${archiveTarget.category.name} budget archived.`;
      setArchiveTarget(undefined);
      announce(message);
    } catch {
      toast.error("Could not archive this budget");
    }
  }

  function renderGroup(title: string, group: readonly BudgetProgress[]): ReactNode {
    if (group.length === 0 || firstPage === undefined) {
      return null;
    }
    return (
      <section aria-labelledby={`budget-group-${title.toLowerCase().replaceAll(" ", "-")}`}>
        <h2
          id={`budget-group-${title.toLowerCase().replaceAll(" ", "-")}`}
          className="mb-3 text-lg font-bold text-foreground"
        >
          {title}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {group.map((progress) => (
            <BudgetCard
              key={progress.budget.id}
              progress={progress}
              month={firstPage.month}
              onEdit={openEditor}
              onArchive={setArchiveTarget}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4.5">
      <header className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Monthly budgets
          </h1>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Category spending limits and live utilization
            {firstPage === undefined ? "" : ` · ${monthLabel(firstPage.month)}`}.
          </p>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={expenseCategories.length === 0}
          onClick={() => openEditor()}
        >
          <span className="mr-1 text-base leading-none">+</span> Add budget
        </Button>
      </header>

      {firstPage === undefined && query.isPending ? (
        <p className="py-16 text-center text-sm text-foreground-muted">Loading budgets…</p>
      ) : query.isError && firstPage === undefined ? (
        <EmptyState
          title="Budgets are unavailable"
          description="The live monthly totals could not be loaded. Try again in a moment."
          action={
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : firstPage === undefined ? null : (
        <>
          <div
            className={`mb-5 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
              searchQuery.trim() !== ""
                ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
                : "border-border/80 bg-surface-elevated/90"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20">
              <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
                ⌕
              </span>
              <input
                value={searchQuery}
                name="budgetSearch"
                autoComplete="off"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search budgets by category name…"
                aria-label="Search budgets"
                className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
              />
              {searchQuery !== "" && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search input"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <BudgetOverview overview={firstPage.overview} />

          {items.length === 0 ? (
            <EmptyState
              title={
                expenseCategories.length === 0
                  ? "Create an expense category first"
                  : "No monthly budgets yet"
              }
              description={
                expenseCategories.length === 0 ? (
                  <>
                    An active expense category is required.{" "}
                    <Link href="/categories" className="font-semibold text-accent">
                      Manage categories
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Budgets are optional planning limits. Review{" "}
                    <Link href="/reports" className="font-semibold text-accent">
                      prior spending in Reports
                    </Link>{" "}
                    before choosing an amount.
                  </>
                )
              }
              action={
                expenseCategories.length === 0 ? undefined : (
                  <Button type="button" onClick={() => openEditor()}>
                    Add your first budget
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-7">
              {renderGroup("Needs attention", attention)}
              {renderGroup("On track", onTrack)}
              {renderGroup("Inactive", inactive)}
            </div>
          )}

          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more budgets"}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
                className="h-5 w-5 accent-accent"
              />
              Show inactive budgets
            </label>
            <p className="text-xs text-foreground-muted">
              Alerts are recorded once at 80% and 100% utilization each month.
            </p>
          </div>
        </>
      )}

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {editorOpen ? (
        <BudgetForm
          key={editTarget?.budget.id ?? "new-budget"}
          categories={expenseCategories}
          budgets={items}
          {...(editTarget === undefined ? {} : { initialProgress: editTarget })}
          onClose={closeEditor}
          onSaved={announce}
        />
      ) : null}
      {archiveTarget === undefined ? null : (
        <ArchiveBudgetDialog
          progress={archiveTarget}
          isPending={archive.isPending}
          onCancel={() => setArchiveTarget(undefined)}
          onConfirm={() => void confirmArchive()}
        />
      )}
    </section>
  );
}

"use client";

import {
  formatMinor,
  type BudgetProgress,
  type Category,
  type CategoryGroup,
  type CategoryKind,
  type MonthlyRollup
} from "@treasury-ops/shared";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConflictError } from "@/lib/errors";

import {
  useArchiveCategory,
  usePermanentlyDeleteCategory,
  useUnarchiveCategory,
  useUpdateCategoryGroup
} from "../hooks/use-category-mutations";
import { useCategories } from "../hooks/use-categories";
import { ArchiveCategoryDialog } from "./archive-category-dialog";
import { CategoryCard, type CategoryStats } from "./category-card";
import { CreateCategorySheet } from "./create-category-sheet";
import { IconGlyph } from "./icon-glyph";
import { PermanentDeleteCategoryDialog } from "./permanent-delete-category-dialog";

type CategoryView = "active" | "archived";
type GroupFilter = "all" | "essential" | "lifestyle" | "unassigned";
type SortOption = "name_asc" | "spend_desc" | "txns_desc" | "subs_desc";

type CategoryManagerProps = Readonly<{
  initialCategories: Category[];
  monthlyRollup?: MonthlyRollup | null | undefined;
  budgets?: BudgetProgress[] | undefined;
  currentMonth?: string | undefined;
}>;

function isSortOption(value: string): value is SortOption {
  return (
    value === "name_asc" || value === "spend_desc" || value === "txns_desc" || value === "subs_desc"
  );
}

export function CategoryManager({
  initialCategories,
  monthlyRollup,
  budgets = []
}: CategoryManagerProps): ReactNode {
  const categories = useCategories(initialCategories, true);
  const archiveCategory = useArchiveCategory();
  const unarchiveCategory = useUnarchiveCategory();
  const updateCategoryGroup = useUpdateCategoryGroup();
  const permanentlyDeleteCategory = usePermanentlyDeleteCategory();

  const [kind, setKind] = useState<CategoryKind>("expense");
  const [view, setView] = useState<CategoryView>("active");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [editTarget, setEditTarget] = useState<Category>();
  const [quickRenameTarget, setQuickRenameTarget] = useState<Category>();
  const [archiveTarget, setArchiveTarget] = useState<Category>();
  const [deleteTarget, setDeleteTarget] = useState<Category>();

  const allItems = categories.data ?? initialCategories;
  const items = allItems.filter((item) => !item.isArchived);
  const archivedItems = allItems.filter((item) => item.isArchived);

  // Map of categoryId -> direct monthly rollup metrics
  const directRollupMap = useMemo(() => {
    const map = new Map<string, { spentMinor: number; incomeMinor: number; txnCount: number }>();
    if (monthlyRollup?.byCategory !== undefined) {
      for (const entry of monthlyRollup.byCategory) {
        if (entry.categoryId !== undefined) {
          map.set(entry.categoryId, {
            spentMinor: entry.spentMinor,
            incomeMinor: entry.incomeMinor,
            txnCount: entry.txnCount
          });
        }
      }
    }
    return map;
  }, [monthlyRollup]);

  // Aggregate stats map (including subcategories recursive aggregation)
  const categoryStatsMap = useMemo(() => {
    const map = new Map<string, CategoryStats>();

    function computeStats(catId: string): CategoryStats {
      const existing = map.get(catId);
      if (existing !== undefined) return existing;

      const direct = directRollupMap.get(catId) ?? { spentMinor: 0, incomeMinor: 0, txnCount: 0 };
      let totalSpent = direct.spentMinor;
      let totalIncome = direct.incomeMinor;
      let totalTxns = direct.txnCount;

      const children = allItems.filter((c) => c.parentId === catId);
      for (const child of children) {
        const childStats = computeStats(child.id);
        totalSpent += childStats.spentMinor;
        totalIncome += childStats.incomeMinor;
        totalTxns += childStats.txnCount;
      }

      const res: CategoryStats = {
        spentMinor: totalSpent,
        incomeMinor: totalIncome,
        txnCount: totalTxns
      };
      map.set(catId, res);
      return res;
    }

    for (const cat of allItems) {
      computeStats(cat.id);
    }

    return map;
  }, [allItems, directRollupMap]);

  // Budget map by category ID
  const budgetMap = useMemo(() => {
    const map = new Map<string, BudgetProgress>();
    for (const b of budgets) {
      map.set(b.category.id, b);
    }
    return map;
  }, [budgets]);

  // High level counts & metrics
  const totalExpense = items.filter((item) => item.kind === "expense").length;
  const totalIncome = items.filter((item) => item.kind === "income").length;
  const totalSubcategories = items.filter((item) => item.parentId !== undefined).length;
  const totalTopLevel = items.filter((item) => item.parentId === undefined).length;

  const essentialExpenseItems = items.filter(
    (item) => item.kind === "expense" && item.group === "essential"
  );
  const lifestyleExpenseItems = items.filter(
    (item) => item.kind === "expense" && item.group === "lifestyle"
  );

  const totalMonthlyExpenseSpent = items
    .filter((item) => item.kind === "expense" && item.parentId === undefined)
    .reduce((acc, cat) => acc + (categoryStatsMap.get(cat.id)?.spentMinor ?? 0), 0);

  const budgetedExpenseCount = items.filter(
    (item) => item.kind === "expense" && budgetMap.has(item.id)
  ).length;

  const counts = {
    expense: totalExpense,
    income: totalIncome
  };

  const inKind = items.filter((item) => item.kind === kind);
  const archivedInKind = archivedItems.filter((item) => item.kind === kind);

  let parents = inKind.filter((item) => item.parentId === undefined);
  let archivedShown = archivedInKind;

  // Filter by Group (for expenses)
  if (kind === "expense" && groupFilter !== "all") {
    parents = parents.filter((parent) => {
      if (groupFilter === "essential") return parent.group === "essential";
      if (groupFilter === "lifestyle") return parent.group === "lifestyle";
      if (groupFilter === "unassigned") return parent.group === undefined || parent.group === null;
      return true;
    });
  }

  // Search filter
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    parents = parents.filter((parent) => {
      const parentMatches = parent.name.toLowerCase().includes(q);
      const subMatches = inKind.some(
        (child) => child.parentId === parent.id && child.name.toLowerCase().includes(q)
      );
      return parentMatches || subMatches;
    });
    archivedShown = archivedShown.filter((item) => item.name.toLowerCase().includes(q));
  }

  // Sorting
  parents = [...parents].sort((a, b) => {
    if (sortBy === "name_asc") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "spend_desc") {
      const spendA = categoryStatsMap.get(a.id)?.spentMinor ?? 0;
      const spendB = categoryStatsMap.get(b.id)?.spentMinor ?? 0;
      return spendB - spendA;
    }
    if (sortBy === "txns_desc") {
      const txnsA = categoryStatsMap.get(a.id)?.txnCount ?? 0;
      const txnsB = categoryStatsMap.get(b.id)?.txnCount ?? 0;
      return txnsB - txnsA;
    }
    if (sortBy === "subs_desc") {
      const subsA = inKind.filter((c) => c.parentId === a.id).length;
      const subsB = inKind.filter((c) => c.parentId === b.id).length;
      return subsB - subsA;
    }
    return 0;
  });

  const childrenOf = (parentId: string): Category[] =>
    inKind.filter((item) => item.parentId === parentId);
  const hasChildren =
    archiveTarget !== undefined && items.some((item) => item.parentId === archiveTarget.id);

  async function handleUpdateGroup(
    category: Category,
    newGroup: CategoryGroup | null
  ): Promise<void> {
    try {
      await updateCategoryGroup.mutateAsync({ categoryId: category.id, group: newGroup });
      toast.success(
        newGroup === "essential"
          ? `Marked "${category.name}" as Essential (Needs)`
          : newGroup === "lifestyle"
            ? `Marked "${category.name}" as Lifestyle (Wants)`
            : `Unassigned group for "${category.name}"`
      );
    } catch {
      toast.error("Could not update category grouping");
    }
  }

  function handleAddSubcategory(parentCategory: Category): void {
    setCreateParentId(parentCategory.id);
    setCreateOpen(true);
  }

  async function confirmArchive(): Promise<void> {
    if (archiveTarget === undefined) return;
    try {
      await archiveCategory.mutateAsync(archiveTarget.id);
      setArchiveTarget(undefined);
      toast.success("Category archived");
    } catch {
      toast.error("Could not archive this category");
    }
  }

  async function restore(category: Category): Promise<void> {
    try {
      await unarchiveCategory.mutateAsync(category.id);
      toast.success("Category unarchived");
    } catch (error: unknown) {
      if (
        error instanceof ConflictError &&
        error.context.problemType === "category.name_conflict"
      ) {
        setQuickRenameTarget(category);
        toast.error(
          "An active sibling already uses that name. Rename this category to restore it."
        );
        return;
      }
      toast.error(
        error instanceof ConflictError ? error.message : "Could not unarchive this category"
      );
    }
  }

  async function saveQuickRename(category: Category): Promise<void> {
    await unarchiveCategory.mutateAsync(category.id);
    toast.success("Category renamed and unarchived");
    setQuickRenameTarget(undefined);
  }

  async function confirmPermanentDelete(): Promise<void> {
    if (deleteTarget === undefined) return;
    try {
      await permanentlyDeleteCategory.mutateAsync(deleteTarget.id);
      toast.success("Category permanently deleted");
      setDeleteTarget(undefined);
    } catch (error: unknown) {
      toast.error(
        error instanceof ConflictError
          ? error.message
          : "Could not permanently delete this category"
      );
    }
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Treasury Classification
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Categories & Spending Pools
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-foreground-muted">
            Structure how expenses and income are categorized. Organize parent pools, subcategories,
            50/30/20 Needs vs Wants classification, and monthly budget limits.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          type="button"
          onClick={() => {
            setCreateParentId(undefined);
            setCreateOpen(true);
          }}
        >
          <span className="mr-1 text-base leading-none">+</span> New category
        </Button>
      </header>

      {/* Overview Analytics Banner */}
      {allItems.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/80 bg-surface-elevated/90 p-4 shadow-xs">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Active Pools
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-foreground">{items.length}</p>
            <p className="mt-1 text-2xs text-foreground-muted">
              {totalTopLevel} parent · {totalSubcategories} subcategories
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface-elevated/90 p-4 shadow-xs">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              This Month Spend
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-expense">
              {formatMinor(totalMonthlyExpenseSpent)}
            </p>
            <p className="mt-1 text-2xs text-foreground-muted">Across active expense pools</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface-elevated/90 p-4 shadow-xs">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              50/30/20 Breakdown
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-accent">
                {essentialExpenseItems.length}
              </span>
              <span className="text-xs font-semibold text-foreground-muted">Needs</span>
              <span className="text-xs text-border">/</span>
              <span className="font-mono text-2xl font-bold text-foreground">
                {lifestyleExpenseItems.length}
              </span>
              <span className="text-xs font-semibold text-foreground-muted">Wants</span>
            </div>
            <p className="mt-1 text-2xs text-foreground-muted">Essential vs Lifestyle pools</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface-elevated/90 p-4 shadow-xs">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Budget Coverage
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-income">
              {budgetedExpenseCount} / {totalExpense}
            </p>
            <p className="mt-1 text-2xs text-foreground-muted">
              {totalExpense > 0
                ? `${Math.round((budgetedExpenseCount / totalExpense) * 100)}% budgeted`
                : "No expense pools"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Controls & Filter Bar */}
      <div
        className={`flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
          searchQuery.trim() !== "" || view === "archived" || groupFilter !== "all"
            ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
            : "border-border/80 bg-surface-elevated/90"
        }`}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] sm:w-64 sm:flex-none">
          <Input
            id="search-categories"
            label="Search categories"
            placeholder="Search categories…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 text-xs"
          />
        </div>

        {/* Kind Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {(["expense", "income"] as const).map((value) => {
            const active = kind === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(value)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "border-accent bg-accent-glow text-accent shadow-xs"
                    : "border-border/70 bg-surface-elevated/50 text-foreground-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {value === "expense" ? "Expense Pools" : "Income Pools"}
                <span
                  className={`rounded-[5px] px-1.5 py-0.5 font-mono text-2xs font-semibold ${
                    active ? "bg-accent/15 text-accent" : "bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Group Filter (for expense only) */}
        {kind === "expense" && view === "active" ? (
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-muted p-1">
            {[
              { id: "all" as const, label: "All" },
              { id: "essential" as const, label: "Needs" },
              { id: "lifestyle" as const, label: "Wants" }
            ].map((item) => {
              const active = groupFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGroupFilter(item.id)}
                  className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? "bg-surface-elevated text-foreground shadow-xs"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Sort selector */}
        {view === "active" ? (
          <div className="min-w-[150px]">
            <Select
              aria-label="Sort categories"
              value={sortBy}
              onChange={(val) => {
                if (isSortOption(val)) {
                  setSortBy(val);
                }
              }}
              options={[
                { value: "name_asc", label: "Name (A → Z)" },
                { value: "spend_desc", label: "Highest Spend" },
                { value: "txns_desc", label: "Most Transactions" },
                { value: "subs_desc", label: "Most Subcategories" }
              ]}
            />
          </div>
        ) : null}

        {/* View mode: Active / Archived */}
        <div className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1 sm:ml-auto">
          {(["active", "archived"] as const).map((value) => {
            const active = view === value;
            const count = value === "active" ? inKind.length : archivedInKind.length;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setView(value)}
                className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {value === "active" ? "Active" : "Archived"} · {count}
              </button>
            );
          })}
        </div>

        {/* Active Filter Indicators */}
        {(searchQuery.trim() !== "" || view === "archived" || groupFilter !== "all") && (
          <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
            <span className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
              Active Filters:
            </span>
            {searchQuery.trim() !== "" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                <span>Search: &quot;{searchQuery}&quot;</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="hover:text-foreground focus-visible:outline-none"
                  aria-label="Remove search filter"
                >
                  ×
                </button>
              </span>
            )}
            {groupFilter !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                <span>
                  Group: {groupFilter === "essential" ? "Needs (Essential)" : "Wants (Lifestyle)"}
                </span>
                <button
                  type="button"
                  onClick={() => setGroupFilter("all")}
                  className="hover:text-foreground focus-visible:outline-none"
                  aria-label="Remove group filter"
                >
                  ×
                </button>
              </span>
            )}
            {view === "archived" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                <span>Showing archived</span>
                <button
                  type="button"
                  onClick={() => setView("active")}
                  className="hover:text-foreground focus-visible:outline-none"
                  aria-label="Remove archived filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content Grid / Empty States */}
      {view === "archived" ? (
        archivedShown.length === 0 ? (
          <EmptyState
            title={`No archived ${kind} categories`}
            description="Archived categories will appear here with restore and permanent-delete controls."
          />
        ) : (
          <div className="space-y-3">
            {archivedShown.map((category) => (
              <ArchivedCategoryRow
                key={category.id}
                category={category}
                parentName={allItems.find((item) => item.id === category.parentId)?.name}
                isRestoring={
                  unarchiveCategory.isPending && unarchiveCategory.variables === category.id
                }
                onEdit={setEditTarget}
                onUnarchive={(item) => void restore(item)}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )
      ) : parents.length === 0 ? (
        <EmptyState
          title={`No ${kind} categories found`}
          description={
            searchQuery.trim() !== "" || groupFilter !== "all"
              ? "Try clearing your active search query or filters."
              : `Create separate ${kind} categories to keep future entries organized.`
          }
          action={
            <Button
              type="button"
              onClick={() => {
                setCreateParentId(undefined);
                setCreateOpen(true);
              }}
            >
              Create category
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {parents.map((parent) => (
            <CategoryCard
              key={parent.id}
              parent={parent}
              subcategories={childrenOf(parent.id)}
              categories={inKind}
              stats={categoryStatsMap.get(parent.id)}
              budget={budgetMap.get(parent.id)}
              categoryStatsMap={categoryStatsMap}
              onEdit={setEditTarget}
              onArchive={setArchiveTarget}
              onAddSubcategory={handleAddSubcategory}
              onUpdateGroup={(cat, g) => void handleUpdateGroup(cat, g)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Drawers */}
      {createOpen ? (
        <CreateCategorySheet
          defaultKind={kind}
          defaultParentId={createParentId}
          categories={items}
          onClose={() => {
            setCreateOpen(false);
            setCreateParentId(undefined);
          }}
        />
      ) : null}

      {editTarget === undefined ? null : (
        <CreateCategorySheet
          defaultKind={editTarget.kind}
          categories={allItems}
          category={editTarget}
          onClose={() => setEditTarget(undefined)}
        />
      )}

      {quickRenameTarget === undefined ? null : (
        <CreateCategorySheet
          defaultKind={quickRenameTarget.kind}
          categories={allItems}
          category={quickRenameTarget}
          quickRename
          onSaved={saveQuickRename}
          onClose={() => setQuickRenameTarget(undefined)}
        />
      )}

      {archiveTarget === undefined ? null : (
        <ArchiveCategoryDialog
          category={archiveTarget}
          hasChildren={hasChildren}
          isPending={archiveCategory.isPending}
          onCancel={() => setArchiveTarget(undefined)}
          onConfirm={() => void confirmArchive()}
        />
      )}

      {deleteTarget === undefined ? null : (
        <PermanentDeleteCategoryDialog
          category={deleteTarget}
          isPending={permanentlyDeleteCategory.isPending}
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void confirmPermanentDelete()}
        />
      )}
    </section>
  );
}

type ArchivedCategoryRowProps = Readonly<{
  category: Category;
  parentName: string | undefined;
  isRestoring: boolean;
  onEdit: (category: Category) => void;
  onUnarchive: (category: Category) => void;
  onDelete: (category: Category) => void;
}>;

function ArchivedCategoryRow({
  category,
  parentName,
  isRestoring,
  onEdit,
  onUnarchive,
  onDelete
}: ArchivedCategoryRowProps): ReactNode {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-xs transition-all duration-150 hover:border-accent/40 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          style={category.color === undefined ? undefined : { backgroundColor: category.color }}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
            category.color === undefined ? "bg-surface-muted text-foreground-muted" : "text-white"
          }`}
          aria-hidden="true"
        >
          <IconGlyph value={category.icon ?? "folder"} size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{category.name}</h3>
          <p className="mt-1 text-xs text-foreground-muted">
            {parentName === undefined ? "Top-level" : `Under ${parentName}`}
            {category.color === undefined ? "" : ` · ${category.color.toUpperCase()}`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button type="button" variant="secondary" onClick={() => onEdit(category)}>
          Edit
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isRestoring}
          onClick={() => onUnarchive(category)}
        >
          {isRestoring ? "Restoring…" : "Unarchive"}
        </Button>
        <Button
          type="button"
          onClick={() => onDelete(category)}
          className="col-span-2 border border-expense/30 bg-expense/10 text-expense hover:bg-expense/15"
        >
          Permanently delete
        </Button>
      </div>
    </article>
  );
}

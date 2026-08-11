"use client";

import type { Category, CategoryKind } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ConflictError } from "@/lib/errors";

import {
  useArchiveCategory,
  usePermanentlyDeleteCategory,
  useUnarchiveCategory
} from "../hooks/use-category-mutations";
import { useCategories } from "../hooks/use-categories";
import { ArchiveCategoryDialog } from "./archive-category-dialog";
import { CategoryCard } from "./category-card";
import { CreateCategorySheet } from "./create-category-sheet";
import { IconGlyph } from "./icon-glyph";
import { PermanentDeleteCategoryDialog } from "./permanent-delete-category-dialog";

type CategoryView = "active" | "archived";

export function CategoryManager({
  initialCategories
}: Readonly<{ initialCategories: Category[] }>): ReactNode {
  const categories = useCategories(initialCategories, true);
  const archiveCategory = useArchiveCategory();
  const unarchiveCategory = useUnarchiveCategory();
  const permanentlyDeleteCategory = usePermanentlyDeleteCategory();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [view, setView] = useState<CategoryView>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category>();
  const [quickRenameTarget, setQuickRenameTarget] = useState<Category>();
  const [archiveTarget, setArchiveTarget] = useState<Category>();
  const [deleteTarget, setDeleteTarget] = useState<Category>();

  const allItems = categories.data ?? initialCategories;
  const items = allItems.filter((item) => !item.isArchived);
  const archivedItems = allItems.filter((item) => item.isArchived);

  const totalExpense = items.filter((item) => item.kind === "expense").length;
  const totalIncome = items.filter((item) => item.kind === "income").length;
  const totalSubcategories = items.filter((item) => item.parentId !== undefined).length;

  const counts = {
    expense: totalExpense,
    income: totalIncome
  };

  const inKind = items.filter((item) => item.kind === kind);
  const archivedInKind = archivedItems.filter((item) => item.kind === kind);

  let parents = inKind.filter((item) => item.parentId === undefined);
  let archivedShown = archivedInKind;

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

  const childrenOf = (parentId: string): Category[] =>
    inKind.filter((item) => item.parentId === parentId);
  const hasChildren =
    archiveTarget !== undefined && items.some((item) => item.parentId === archiveTarget.id);

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
    <section className="space-y-7">
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
            Expense tracker
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Categories
          </h1>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-foreground-muted">
            How transactions get classified. Expense and income are separate pools; each category
            can sit anywhere in its own hierarchy.
          </p>
        </div>
        <Button className="w-full sm:w-auto" type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New category
        </Button>
      </header>

      {allItems.length === 0 ? null : (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated/80 backdrop-blur p-6 sm:p-7 shadow-xs">
          <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-accent-glow opacity-60 blur-3xl pointer-events-none" />
          <div className="relative z-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-3.5">
              <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
                Active Categories
              </p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-foreground">{items.length}</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
              <p className="font-mono text-[9px] font-bold tracking-wider text-rose-600 dark:text-rose-400 uppercase">
                Expense Pools
              </p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
                {totalExpense}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
              <p className="font-mono text-[9px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase">
                Income Pools
              </p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {totalIncome}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-surface-muted/50 p-3.5">
              <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
                Subcategories
              </p>
              <p className="mt-1.5 font-mono text-2xl font-bold text-foreground">
                {totalSubcategories}
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className={`mb-5 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
          searchQuery.trim() !== "" || view === "archived"
            ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
            : "border-border/80 bg-surface-elevated/90"
        }`}
      >
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

        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          {(["expense", "income"] as const).map((value) => {
            const active = kind === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(value)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "border-accent bg-accent-glow text-accent shadow-xs"
                    : "border-border/70 bg-surface-elevated/50 text-foreground-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {value === "expense" ? "Expense" : "Income"}
                <span
                  className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    active ? "bg-accent/15 text-accent" : "bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
          {(["active", "archived"] as const).map((value) => {
            const active = view === value;
            const count = value === "active" ? inKind.length : archivedInKind.length;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setView(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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

        {(searchQuery.trim() !== "" || view === "archived") && (
          <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
            <span className="font-mono text-[10px] font-semibold text-foreground-muted uppercase">
              Active:
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
          title={`No ${kind} categories yet`}
          description="Create separate categories to keep future entries organised."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create category
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {parents.map((parent) => (
            <CategoryCard
              key={parent.id}
              parent={parent}
              subcategories={childrenOf(parent.id)}
              categories={inKind}
              onEdit={setEditTarget}
              onArchive={setArchiveTarget}
            />
          ))}
        </div>
      )}

      {createOpen ? (
        <CreateCategorySheet
          defaultKind={kind}
          categories={items}
          onClose={() => setCreateOpen(false)}
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

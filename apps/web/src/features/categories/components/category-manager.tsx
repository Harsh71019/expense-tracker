"use client";

import type { Category, CategoryKind } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConflictError } from "@/lib/errors";

import {
  useArchiveCategory,
  usePermanentlyDeleteCategory,
  useUnarchiveCategory
} from "../hooks/use-category-mutations";
import { useCategories } from "../hooks/use-categories";
import { glyphFor } from "../model/palette";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category>();
  const [quickRenameTarget, setQuickRenameTarget] = useState<Category>();
  const [archiveTarget, setArchiveTarget] = useState<Category>();
  const [deleteTarget, setDeleteTarget] = useState<Category>();

  const allItems = categories.data ?? initialCategories;
  const items = allItems.filter((item) => !item.isArchived);
  const archivedItems = allItems.filter((item) => item.isArchived);
  const counts = {
    expense: items.filter((item) => item.kind === "expense").length,
    income: items.filter((item) => item.kind === "income").length
  };
  const inKind = items.filter((item) => item.kind === kind);
  const archivedInKind = archivedItems.filter((item) => item.kind === kind);
  const parents = inKind.filter((item) => item.parentId === undefined);
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
      <Breadcrumbs
        items={[{ label: "Settings", href: "/settings?tab=management" }, { label: "Categories" }]}
      />

      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">LEDGER</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Categories
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-foreground-muted">
            How transactions get classified. Expense and income are separate pools; each category
            can sit anywhere in its own hierarchy.
          </p>
        </div>
        <Button className="w-full sm:w-auto" type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New category
        </Button>
      </header>

      <div className="flex items-center gap-1">
        {(["expense", "income"] as const).map((value) => {
          const active = kind === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(value)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? "border-accent bg-accent-glow text-accent"
                  : "border-transparent text-foreground-muted hover:bg-surface-muted/60"
              }`}
            >
              {value === "expense" ? "Expense" : "Income"}
              <span
                className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                  active ? "text-accent" : "bg-surface-muted text-foreground-muted"
                }`}
              >
                {counts[value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex w-full gap-1 rounded-xl border border-border bg-surface-muted p-1 sm:w-fit">
        {(["active", "archived"] as const).map((value) => {
          const active = view === value;
          const count = value === "active" ? inKind.length : archivedInKind.length;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setView(value)}
              className={`min-h-10 flex-1 rounded-lg px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:flex-none ${
                active
                  ? "bg-surface-elevated text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {value === "active" ? "Active" : "Archived"} · {count}
            </button>
          );
        })}
      </div>

      {view === "archived" ? (
        archivedInKind.length === 0 ? (
          <EmptyState
            title={`No archived ${kind} categories`}
            description="Archived categories will appear here with restore and permanent-delete controls."
          />
        ) : (
          <div className="space-y-3">
            {archivedInKind.map((category) => (
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
        <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
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
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          style={category.color === undefined ? undefined : { backgroundColor: category.color }}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
            category.color === undefined ? "bg-surface-muted text-foreground-muted" : "text-white"
          }`}
          aria-hidden="true"
        >
          <IconGlyph value={glyphFor(category)} size={20} />
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

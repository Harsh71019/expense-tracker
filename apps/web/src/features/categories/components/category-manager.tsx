"use client";

import type { Category, CategoryKind } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { useArchiveCategory } from "../hooks/use-category-mutations";
import { useCategories } from "../hooks/use-categories";
import { ArchiveCategoryDialog } from "./archive-category-dialog";
import { CategoryCard } from "./category-card";
import { CreateCategorySheet } from "./create-category-sheet";

export function CategoryManager({
  initialCategories
}: Readonly<{ initialCategories: Category[] }>): ReactNode {
  const categories = useCategories(initialCategories);
  const archiveCategory = useArchiveCategory();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Category>();

  const items = (categories.data ?? initialCategories).filter((item) => !item.isArchived);
  const counts = {
    expense: items.filter((item) => item.kind === "expense").length,
    income: items.filter((item) => item.kind === "income").length
  };
  const inKind = items.filter((item) => item.kind === kind);
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
            can nest one level under a parent.
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

      {parents.length === 0 ? (
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

      {archiveTarget === undefined ? null : (
        <ArchiveCategoryDialog
          category={archiveTarget}
          hasChildren={hasChildren}
          isPending={archiveCategory.isPending}
          onCancel={() => setArchiveTarget(undefined)}
          onConfirm={() => void confirmArchive()}
        />
      )}
    </section>
  );
}

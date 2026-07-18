"use client";

import {
  CategoryKindSchema,
  CreateCategorySchema,
  type Category,
  type CategoryKind
} from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

import { useCategories } from "../hooks/use-categories";
import { useArchiveCategory, useCreateCategory } from "../hooks/use-category-mutations";

export function CategoryManager({
  initialCategories
}: {
  initialCategories: Category[];
}): ReactNode {
  const categories = useCategories(initialCategories);
  const createCategory = useCreateCategory();
  const archiveCategory = useArchiveCategory();
  const [showForm, setShowForm] = useState(initialCategories.length === 0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [parentId, setParentId] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const [confirming, setConfirming] = useState<Category>();
  const [error, setError] = useState<string>();
  const items = categories.data ?? initialCategories;
  const parents = items.filter((item) => item.kind === kind && item.parentId === undefined);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateCategorySchema.safeParse({
      name,
      kind,
      ...(parentId === "" ? {} : { parentId }),
      ...(icon.trim() === "" ? {} : { icon }),
      ...(color.trim() === "" ? {} : { color })
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the category details.");
      return;
    }
    try {
      await createCategory.mutateAsync(parsed.data);
      setName("");
      setParentId("");
      setIcon("");
      setColor("");
      setShowForm(false);
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not create this category.");
    }
  }

  async function archive(): Promise<void> {
    if (confirming === undefined) return;
    try {
      await archiveCategory.mutateAsync(confirming.id);
      setConfirming(undefined);
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not archive this category.");
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Organise future entries without rewriting ledger history.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Close form" : "Create category"}
        </Button>
      </header>
      {showForm ? (
        <form
          className="space-y-5 rounded-xl border border-border bg-surface-elevated p-5 sm:p-7"
          onSubmit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="category-name"
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Kind
              <select
                className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm"
                value={kind}
                onChange={(event) => {
                  const parsed = CategoryKindSchema.safeParse(event.target.value);
                  if (parsed.success) {
                    setKind(parsed.data);
                    setParentId("");
                  }
                }}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            Parent category
            <select
              className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">None — root category</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="category-icon"
              label="Icon (optional)"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            />
            <Input
              id="category-color"
              label="Colour hex (optional)"
              placeholder="#4F46E5"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </div>
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <Button type="submit" disabled={createCategory.isPending}>
            {createCategory.isPending ? "Creating…" : "Create category"}
          </Button>
        </form>
      ) : null}
      {items.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create separate expense and income categories for clear reporting."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {(["expense", "income"] as const).map((section) => {
            const sectionItems = items.filter((item) => item.kind === section);
            return (
              <section key={section} className="space-y-3">
                <h2 className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
                  {section}
                </h2>
                {sectionItems.length === 0 ? (
                  <p className="text-sm text-foreground-muted">No {section} categories yet.</p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {sectionItems.map((item) => {
                      const parent = items.find((candidate) => candidate.id === item.parentId);
                      return (
                        <article
                          key={item.id}
                          className="relative flex items-start justify-between gap-3 px-4 py-3.5"
                        >
                          <span
                            className="absolute inset-y-0 left-0 w-[3px]"
                            style={{ backgroundColor: item.color ?? "var(--color-border)" }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 pl-2">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {item.icon === undefined ? null : `${item.icon} `}
                              {item.name}
                            </h3>
                            {item.parentId === undefined ? null : (
                              <p className="mt-0.5 text-xs text-foreground-muted">
                                Child of {parent?.name ?? "unavailable category"}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 px-2.5 py-1 text-xs"
                            onClick={() => setConfirming(item)}
                          >
                            Archive
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {confirming === undefined ? null : (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-category-title"
          className="rounded-xl border border-expense/30 bg-surface-elevated p-5"
        >
          <h2 id="archive-category-title" className="text-lg font-bold">
            Archive {confirming.name}?
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Historical transactions remain unchanged. The category will leave future selectors.
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              type="button"
              onClick={() => void archive()}
              disabled={archiveCategory.isPending}
            >
              {archiveCategory.isPending ? "Archiving…" : "Archive category"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(undefined)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}

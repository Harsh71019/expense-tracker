"use client";

import { CreateCategoryRuleSchema, type CategoryRule } from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useCategories } from "@/features/categories";

import {
  useCategoryRules,
  useCreateCategoryRule,
  useDeleteCategoryRule
} from "../hooks/use-category-rules";

export function CategoryRuleManager({ initialRules }: { initialRules: CategoryRule[] }): ReactNode {
  const rules = useCategoryRules(initialRules);
  const categories = useCategories();
  const createRule = useCreateCategoryRule();
  const deleteRule = useDeleteCategoryRule();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [confirming, setConfirming] = useState<CategoryRule>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateCategoryRuleSchema.safeParse({ pattern, categoryId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the rule.");
      return;
    }
    try {
      await createRule.mutateAsync(parsed.data);
      setPattern("");
      setCategoryId("");
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not create this rule.");
    }
  }

  async function remove(): Promise<void> {
    if (confirming === undefined) return;
    try {
      await deleteRule.mutateAsync(confirming.id);
      setConfirming(undefined);
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not delete this rule.");
    }
  }

  const categoryItems = categories.data ?? [];
  const categoryName = (id: string): string =>
    categoryItems.find((item) => item.id === id)?.name ?? "Unavailable category";
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Automatic categories</h1>
        <p className="mt-1.5 text-sm text-foreground-muted">
          Matching ignores letter case. When several rules match, the longest pattern wins.
        </p>
      </header>
      <form
        className="space-y-4 rounded-xl border border-border bg-surface-elevated p-5"
        onSubmit={submit}
      >
        <Input
          id="rule-pattern"
          label="Description contains"
          placeholder="SWIGGY"
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
        />
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          Assign category
          <select
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Select a category</option>
            {categoryItems.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {category.kind}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-foreground-muted">
          Plain text only—regular expressions are not supported.
        </p>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" disabled={createRule.isPending}>
          {createRule.isPending ? "Creating…" : "Create rule"}
        </Button>
      </form>
      {(rules.data ?? []).length === 0 ? (
        <EmptyState
          title="No automatic rules"
          description="Imports still work; staged rows simply have no automatic category suggestion."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {(rules.data ?? []).map((rule) => (
            <article
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
            >
              <p className="text-sm">
                Description contains <strong>“{rule.pattern}”</strong> →{" "}
                <strong>{categoryName(rule.categoryId)}</strong>
              </p>
              <Button
                type="button"
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                onClick={() => setConfirming(rule)}
              >
                Delete rule
              </Button>
            </article>
          ))}
        </div>
      )}
      {confirming === undefined ? null : (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-rule-title"
          className="rounded-xl border border-expense/30 bg-surface-elevated p-5"
        >
          <h2 id="delete-rule-title" className="text-lg font-bold">
            Delete “{confirming.pattern}”?
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Existing transactions and staged rows stay unchanged. Only future suggestions are
            affected.
          </p>
          <div className="mt-5 flex gap-3">
            <Button type="button" onClick={() => void remove()} disabled={deleteRule.isPending}>
              {deleteRule.isPending ? "Deleting…" : "Delete rule"}
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

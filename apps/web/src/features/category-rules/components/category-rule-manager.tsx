"use client";

import { CreateCategoryRuleSchema, type CategoryRule } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { EmptyState } from "@/components/ui/empty-state";
import { useCategories } from "@/features/categories";
import { userErrorMessage } from "@/lib/errors";

import {
  useCategoryRules,
  useCreateCategoryRule,
  useDeleteCategoryRule
} from "../hooks/use-category-rules";
import { CreateRuleRow } from "./create-rule-row";
import { RuleRow } from "./rule-row";
import { RuleTester } from "./rule-tester";

export function CategoryRuleManager({
  initialRules
}: Readonly<{ initialRules: CategoryRule[] }>): ReactNode {
  const rules = useCategoryRules(initialRules);
  const categories = useCategories();
  const createRule = useCreateCategoryRule();
  const deleteRule = useDeleteCategoryRule();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const rawItems = rules.data ?? initialRules;
  const categoryItems = categories.data ?? [];

  let items = rawItems;
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    items = items.filter((rule) => {
      const categoryName = categoryItems.find((cat) => cat.id === rule.categoryId)?.name ?? "";
      return rule.pattern.toLowerCase().includes(q) || categoryName.toLowerCase().includes(q);
    });
  }

  async function submit(): Promise<void> {
    const parsed = CreateCategoryRuleSchema.safeParse({ pattern, categoryId });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the rule details");
      return;
    }
    try {
      await createRule.mutateAsync(parsed.data);
      setPattern("");
      setCategoryId("");
      toast.success("Category rule created");
    } catch (error: unknown) {
      toast.error(userErrorMessage(error, "Could not create this rule."));
    }
  }

  async function remove(rule: CategoryRule): Promise<void> {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast.success("Category rule deleted");
    } catch (error: unknown) {
      toast.error(userErrorMessage(error, "Could not delete this rule."));
    }
  }

  return (
    <section className="w-full space-y-6">
      <header>
        <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">
          LEDGER · AUTOMATION
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Category rules
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
          When an imported row&apos;s description contains your text, we suggest a category for it.
          Plain case-insensitive match — no wildcards or regex.
        </p>
      </header>

      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-muted px-4 py-3.5 text-[13.5px] leading-relaxed text-foreground-muted">
        <span className="shrink-0 text-accent" aria-hidden="true">
          ⓘ
        </span>
        <span>
          Rules only run while staging a CSV import. They never re-categorize existing or
          manually-added transactions.
        </span>
      </div>

      <RuleTester rules={rawItems} categories={categoryItems} />

      {rawItems.length > 0 && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
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
              name="ruleSearch"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search category rules by pattern or category name…"
              aria-label="Search category rules"
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
      )}

      <div className="flex items-baseline justify-between pt-1">
        <h2 className="text-[17px] font-bold text-foreground">
          {items.length} rule{items.length === 1 ? "" : "s"}
        </h2>
      </div>

      <CreateRuleRow
        categories={categoryItems}
        pattern={pattern}
        categoryId={categoryId}
        isPending={createRule.isPending}
        onPatternChange={setPattern}
        onCategoryChange={setCategoryId}
        onSubmit={() => void submit()}
      />

      {items.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="Add your first rule above. Next time you import a CSV, matching rows get a category suggested automatically."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              category={categoryItems.find((category) => category.id === rule.categoryId)}
              onDelete={(target) => void remove(target)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

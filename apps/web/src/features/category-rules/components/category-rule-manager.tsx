"use client";

import { CreateCategoryRuleSchema, type CategoryRule } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/ui/empty-state";
import { useCategories } from "@/features/categories";

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

  const items = rules.data ?? initialRules;
  const categoryItems = categories.data ?? [];

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
    } catch {
      toast.error("Could not create this rule");
    }
  }

  async function remove(rule: CategoryRule): Promise<void> {
    try {
      await deleteRule.mutateAsync(rule.id);
    } catch {
      toast.error("Could not delete this rule");
    }
  }

  return (
    <section className="mx-auto max-w-[940px] space-y-6">
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

      <RuleTester rules={items} categories={categoryItems} />

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

"use client";

import {
  CreateCategoryRuleSchema,
  type Category,
  type CategoryRule,
  type TransactionType
} from "@treasury-ops/shared";
import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Select, type SelectOption } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { glyphFor, IconGlyph, lighten, useCategories } from "@/features/categories";
import { userErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

import {
  useCategoryRules,
  useCreateCategoryRule,
  useDeleteCategoryRule
} from "../hooks/use-category-rules";
import { CreateRuleRow } from "./create-rule-row";
import { DeleteRuleDialog } from "./delete-rule-dialog";
import { RuleRow } from "./rule-row";
import { RuleTester } from "./rule-tester";

type RuleSortOption = "pattern_asc" | "recent_desc" | "category_asc";
type KindFilter = "all" | TransactionType;
type ViewMode = "grouped" | "flat";

function isRuleSortOption(value: string): value is RuleSortOption {
  return value === "pattern_asc" || value === "recent_desc" || value === "category_asc";
}

function dotStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return { background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${color})` };
}

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
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<RuleSortOption>("pattern_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [deletingRule, setDeletingRule] = useState<CategoryRule | null>(null);
  const [sandboxSeed, setSandboxSeed] = useState("");

  const rawRules = useMemo(() => rules.data ?? initialRules, [rules.data, initialRules]);
  const rawCategories = useMemo(() => categories.data ?? [], [categories.data]);
  const activeCategories = useMemo(
    () => rawCategories.filter((cat) => !cat.isArchived),
    [rawCategories]
  );

  // Analytics Metrics
  const totalRules = rawRules.length;
  const coveredCategoryIds = useMemo(
    () => new Set(rawRules.map((rule) => rule.categoryId)),
    [rawRules]
  );

  const coveredCount = activeCategories.filter((cat) => coveredCategoryIds.has(cat.id)).length;
  const totalActiveCount = activeCategories.length;
  const coveragePercent =
    totalActiveCount > 0 ? Math.round((coveredCount / totalActiveCount) * 100) : 0;

  const expenseRulesCount = useMemo(
    () =>
      rawRules.filter((r) => {
        const cat = rawCategories.find((c) => c.id === r.categoryId);
        return cat?.kind !== "income";
      }).length,
    [rawRules, rawCategories]
  );
  const incomeRulesCount = totalRules - expenseRulesCount;

  const uncoveredCategories = useMemo(
    () => activeCategories.filter((cat) => !coveredCategoryIds.has(cat.id)),
    [activeCategories, coveredCategoryIds]
  );

  // Filter & Sort Rules
  const filteredRules = useMemo(() => {
    let list = rawRules;

    // Search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((rule) => {
        const category = rawCategories.find((cat) => cat.id === rule.categoryId);
        const categoryName = category?.name ?? "";
        return rule.pattern.toLowerCase().includes(q) || categoryName.toLowerCase().includes(q);
      });
    }

    // Kind filter
    if (kindFilter !== "all") {
      list = list.filter((rule) => {
        const category = rawCategories.find((cat) => cat.id === rule.categoryId);
        return (category?.kind ?? "expense") === kindFilter;
      });
    }

    // Specific category filter
    if (selectedCategoryFilter !== "") {
      list = list.filter((rule) => rule.categoryId === selectedCategoryFilter);
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === "recent_desc") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "category_asc") {
        const catA = rawCategories.find((cat) => cat.id === a.categoryId)?.name ?? "";
        const catB = rawCategories.find((cat) => cat.id === b.categoryId)?.name ?? "";
        return catA.localeCompare(catB);
      }
      return a.pattern.localeCompare(b.pattern);
    });
  }, [rawRules, rawCategories, searchQuery, kindFilter, selectedCategoryFilter, sortBy]);

  // Grouped by Category Map
  const groupedRules = useMemo(() => {
    const map = new Map<string, { category: Category | undefined; rules: CategoryRule[] }>();
    for (const rule of filteredRules) {
      const cat = rawCategories.find((c) => c.id === rule.categoryId);
      const key = rule.categoryId;
      const existing = map.get(key);
      if (existing !== undefined) {
        existing.rules.push(rule);
      } else {
        map.set(key, { category: cat, rules: [rule] });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const nameA = a.category?.name ?? "Unavailable";
      const nameB = b.category?.name ?? "Unavailable";
      return nameA.localeCompare(nameB);
    });
  }, [filteredRules, rawCategories]);

  async function submitCreate(): Promise<void> {
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

  async function handleConfirmDelete(): Promise<void> {
    if (deletingRule === null) return;
    try {
      await deleteRule.mutateAsync(deletingRule.id);
      setDeletingRule(null);
      toast.success("Category rule deleted");
    } catch (error: unknown) {
      toast.error(userErrorMessage(error, "Could not delete this rule."));
    }
  }

  function handleQuickAddForCategory(targetCategoryId: string): void {
    setCategoryId(targetCategoryId);
    const element = document.getElementById("new-rule-pattern");
    element?.focus();
  }

  const categoryFilterOptions: readonly SelectOption[] = [
    { value: "", label: "All Categories" },
    ...activeCategories.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` }))
  ];

  return (
    <section className="w-full space-y-6">
      {/* Header */}
      <header>
        <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">
          LEDGER · AUTOMATION ENGINE
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Category rules
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
          Define automatic merchant and narration keyword rules. During CSV import staging, matched
          transactions receive an instant category suggestion with 100% confidence.
        </p>
      </header>

      {/* KPI Summary Analytics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-xs">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            Active Rules
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {totalRules}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">Automation patterns</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-xs">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            Category Coverage
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {coveragePercent}%
            </span>
            <span className="text-xs text-foreground-muted">
              ({coveredCount}/{totalActiveCount})
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              style={{ width: `${coveragePercent}%` }}
              className="h-full rounded-full bg-accent transition-all duration-300"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-xs">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            Rule Split
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div>
              <span className="text-xl font-bold text-rose-500">{expenseRulesCount}</span>
              <span className="ml-1 text-[11px] text-foreground-muted">Expense</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div>
              <span className="text-xl font-bold text-emerald-500">{incomeRulesCount}</span>
              <span className="ml-1 text-[11px] text-foreground-muted">Income</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-foreground-muted">By category pool</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-xs">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            Needs Rules
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-500 sm:text-3xl">
            {uncoveredCategories.length}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">Categories unassigned</p>
        </div>
      </div>

      {/* Uncovered Categories Assistant */}
      {uncoveredCategories.length > 0 ? (
        <div className="rounded-2xl border border-border/80 bg-surface-muted/50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-sm">💡</span>
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Categories without automation ({uncoveredCategories.length})
              </h3>
            </div>
            <span className="text-[11px] text-foreground-muted">
              Click any category to create a rule for it
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {uncoveredCategories.slice(0, 10).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleQuickAddForCategory(cat.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-elevated px-3 py-1 text-xs font-semibold text-foreground transition-all hover:border-accent hover:bg-accent-glow hover:text-accent shadow-2xs"
              >
                <span
                  style={dotStyle(cat.color)}
                  className={`grid h-4 w-4 place-items-center overflow-hidden rounded-full text-[10px] ${
                    cat.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
                  }`}
                  aria-hidden="true"
                >
                  <IconGlyph value={glyphFor(cat)} size={9} />
                </span>
                <span>{cat.name}</span>
                <span className="text-accent text-[11px] font-bold">+</span>
              </button>
            ))}
            {uncoveredCategories.length > 10 ? (
              <span className="self-center font-mono text-xs text-foreground-muted">
                +{uncoveredCategories.length - 10} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Interactive Sandbox Tester */}
      <RuleTester rules={rawRules} categories={rawCategories} initialValue={sandboxSeed} />

      {/* Creation Row */}
      <CreateRuleRow
        categories={activeCategories}
        pattern={pattern}
        categoryId={categoryId}
        existingRules={rawRules}
        isPending={createRule.isPending}
        onPatternChange={setPattern}
        onCategoryChange={setCategoryId}
        onSubmit={() => void submitCreate()}
      />

      {/* Filter and View Controls Bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-border bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  viewMode === "grouped"
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                Grouped
              </button>
              <button
                type="button"
                onClick={() => setViewMode("flat")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  viewMode === "flat"
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                Flat List
              </button>
            </div>

            {/* Kind Filter Pills */}
            <div className="flex items-center rounded-xl border border-border bg-surface-muted p-1">
              {(
                [
                  { id: "all", label: "All Rules" },
                  { id: "expense", label: "Expense" },
                  { id: "income", label: "Income" }
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setKindFilter(pill.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    kindFilter === pill.id
                      ? "bg-accent text-accent-foreground shadow-xs font-bold"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Specific Category Select */}
            <div className="min-w-[170px]">
              <Select
                aria-label="Filter by category"
                value={selectedCategoryFilter}
                onChange={setSelectedCategoryFilter}
                options={categoryFilterOptions}
              />
            </div>

            {/* Sort Select */}
            <div className="min-w-[150px]">
              <Select
                aria-label="Sort category rules"
                value={sortBy}
                onChange={(val) => {
                  if (isRuleSortOption(val)) setSortBy(val);
                }}
                options={[
                  { value: "pattern_asc", label: "Pattern (A → Z)" },
                  { value: "recent_desc", label: "Recently Added" },
                  { value: "category_asc", label: "Category Name" }
                ]}
              />
            </div>
          </div>
        </div>

        {/* Live Search */}
        {rawRules.length > 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-surface-elevated px-3.5 shadow-2xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <span className="text-foreground-muted text-sm font-semibold" aria-hidden="true">
              ⌕
            </span>
            <input
              value={searchQuery}
              name="ruleSearch"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search rules by pattern keyword or category name…"
              aria-label="Search category rules"
              className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
            />
            {searchQuery !== "" ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search input"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Rules Section Heading */}
      <div className="flex items-baseline justify-between pt-1">
        <h2 className="text-[17px] font-bold text-foreground">
          {filteredRules.length} rule{filteredRules.length === 1 ? "" : "s"}
        </h2>
        {filteredRules.length !== rawRules.length ? (
          <span className="text-xs text-foreground-muted">
            Filtered from {rawRules.length} total
          </span>
        ) : null}
      </div>

      {/* Rules List / Empty State */}
      {filteredRules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="Add your first rule above. Next time you import a CSV, matching rows get a category suggested automatically."
        />
      ) : viewMode === "grouped" ? (
        <div className="space-y-5">
          {groupedRules.map((group) => {
            const cat = group.category;
            const categoryName = cat?.name ?? "Unavailable Category";
            const kind = cat?.kind ?? "expense";

            return (
              <div
                key={cat?.id ?? "unavailable"}
                className="rounded-2xl border border-border/80 bg-surface-muted/30 p-4 sm:p-5 shadow-xs"
              >
                {/* Category Header */}
                <div className="mb-3.5 flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      style={dotStyle(cat?.color)}
                      className={`grid h-7 w-7 place-items-center overflow-hidden rounded-xl text-xs ${
                        cat?.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
                      }`}
                      aria-hidden="true"
                    >
                      <IconGlyph value={cat === undefined ? "?" : glyphFor(cat)} size={14} />
                    </span>
                    <div>
                      <span className="text-sm font-bold text-foreground">{categoryName}</span>
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          kind === "income"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {kind}
                      </span>
                    </div>
                  </div>

                  <span className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-mono font-bold text-foreground-muted border border-border/60">
                    {group.rules.length} {group.rules.length === 1 ? "rule" : "rules"}
                  </span>
                </div>

                {/* Group Rules */}
                <div className="space-y-2.5">
                  {group.rules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      category={cat}
                      onTestPattern={(pat) => setSandboxSeed(pat)}
                      onDelete={(target) => setDeletingRule(target)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              category={rawCategories.find((category) => category.id === rule.categoryId)}
              onTestPattern={(pat) => setSandboxSeed(pat)}
              onDelete={(target) => setDeletingRule(target)}
            />
          ))}
        </div>
      )}

      {/* Delete Rule Confirmation Dialog */}
      {deletingRule !== null ? (
        <DeleteRuleDialog
          rule={deletingRule}
          category={rawCategories.find((c) => c.id === deletingRule.categoryId)}
          isPending={deleteRule.isPending}
          onCancel={() => setDeletingRule(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </section>
  );
}

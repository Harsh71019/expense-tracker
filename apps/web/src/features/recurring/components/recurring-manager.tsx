"use client";

import type {
  Account,
  Category,
  RecurringReconciliationReviewItem,
  RecurringRule,
  RecurringStats,
  DetectedStreamPage
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { useAccounts } from "@/features/accounts";
import { glyphFor, IconGlyph, tint, useCategories } from "@/features/categories";
import { userErrorMessage } from "@/lib/errors";

import { useRecurringRules, useUpdateRecurringRule } from "../hooks/use-recurring-rules";
import { describeSchedule, parseSchedule } from "../model/schedule";
import { OccurrenceTickRow } from "./occurrence-tick-row";
import { ReconciliationReviewPanel } from "./reconciliation-review-panel";
import { RecurringRuleDrawer } from "./recurring-rule-drawer";
import { RecurringStatsCards } from "./recurring-stats-cards";
import { DetectedStreamReviewPanel } from "./detected-stream-review-panel";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type ManagerProps = Readonly<{
  initialRules: RecurringRule[];
  accounts: Account[];
  categories: Category[];
  initialReconciliations: RecurringReconciliationReviewItem[];
  initialStats: RecurringStats | null;
  initialDetectedStreams?: DetectedStreamPage;
}>;

type StatusFilter = "all" | "active" | "paused";
type TypeFilter = "all" | "expense" | "income";
type FrequencyFilter = "all" | "daily" | "weekly" | "monthly" | "yearly";

export function RecurringManager({
  initialRules,
  accounts = [],
  categories = [],
  initialReconciliations = [],
  initialStats = null,
  initialDetectedStreams = { items: [], nextCursor: null }
}: ManagerProps): ReactNode {
  const rules = useRecurringRules(initialRules);
  const accountQuery = useAccounts(accounts.length === 0 ? undefined : accounts);
  const categoryQuery = useCategories(categories.length === 0 ? undefined : categories);
  const updateRule = useUpdateRecurringRule();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>("all");

  const rawItems = rules.data ?? initialRules;
  const accountItems = accountQuery.data ?? accounts;
  const categoryItems = categoryQuery.data ?? categories;

  const accountMap = new Map(accountItems.map((account) => [account.id, account]));
  const categoryMap = new Map(categoryItems.map((category) => [category.id, category]));

  let items = rawItems;
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    items = items.filter(
      (rule) =>
        rule.template.description.toLowerCase().includes(q) ||
        (rule.template.categoryId !== undefined &&
          categoryMap.get(rule.template.categoryId)?.name.toLowerCase().includes(q)) ||
        accountMap.get(rule.template.accountId)?.name.toLowerCase().includes(q)
    );
  }

  if (statusFilter !== "all") {
    items = items.filter((rule) => (statusFilter === "active" ? !rule.isPaused : rule.isPaused));
  }

  if (typeFilter !== "all") {
    items = items.filter((rule) => rule.template.type === typeFilter);
  }

  if (frequencyFilter !== "all") {
    items = items.filter((rule) => {
      const parsed = parseSchedule(rule.rrule, rule.startAt);
      return parsed !== null && parsed.frequency === frequencyFilter;
    });
  }

  const isFiltered =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    frequencyFilter !== "all";

  function openCreate(): void {
    setEditing(undefined);
    setDrawerOpen(true);
  }

  function openEdit(rule: RecurringRule): void {
    setEditing(rule);
    setDrawerOpen(true);
  }

  async function togglePause(rule: RecurringRule): Promise<void> {
    try {
      await updateRule.mutateAsync({
        ruleId: rule.id,
        patch: { isPaused: !rule.isPaused }
      });
      toast.success(rule.isPaused ? "Recurring rule resumed" : "Recurring rule paused");
    } catch (error: unknown) {
      toast.error(
        userErrorMessage(
          error,
          rule.isPaused ? "Could not resume this rule." : "Could not pause this rule."
        )
      );
    }
  }

  return (
    <section className="space-y-4.5 animate-fade-in">
      {/* Recurring Header */}
      <header className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Recurring
          </h1>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Scheduled transactions, subscriptions, and recurring salary/rent schedules.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto shadow-glow"
          type="button"
          onClick={openCreate}
          disabled={accountItems.length === 0}
        >
          <span className="mr-1 text-base leading-none">+</span> New rule
        </Button>
      </header>

      {/* Analytics KPIs */}
      <RecurringStatsCards initialStats={initialStats} />

      <DetectedStreamReviewPanel initialPage={initialDetectedStreams} accounts={accountItems} />

      {/* Reconciliation Reviews */}
      <ReconciliationReviewPanel initialReconciliations={initialReconciliations} />

      {/* Filter & Search Toolbar */}
      {rawItems.length > 0 && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
            isFiltered
              ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
              : "border-border/80 bg-surface-elevated/90 shadow-xs"
          }`}
        >
          {/* Search Input */}
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20 sm:min-w-56 sm:basis-auto">
            <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
              ⌕
            </span>
            <input
              value={searchQuery}
              name="recurringSearch"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search recurring rules…"
              aria-label="Search recurring rules"
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

          {/* Status Filters */}
          <div className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
            {(["all", "active", "paused"] as const).map((status) => {
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? "bg-surface-elevated text-foreground shadow-xs"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {status === "all" ? "All" : status === "active" ? "Active" : "Paused"}
                </button>
              );
            })}
          </div>

          {/* Type Filters */}
          <div className="hidden gap-1 rounded-xl border border-border bg-surface-muted p-1 md:flex">
            {(["all", "expense", "income"] as const).map((type) => {
              const active = typeFilter === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? "bg-surface-elevated text-foreground shadow-xs"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {type === "all" ? "All Types" : type === "expense" ? "Expense" : "Income"}
                </button>
              );
            })}
          </div>

          {/* Frequency Filters */}
          <div className="hidden gap-1 rounded-xl border border-border bg-surface-muted p-1 lg:flex">
            {(["all", "monthly", "weekly", "yearly"] as const).map((freq) => {
              const active = frequencyFilter === freq;
              return (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setFrequencyFilter(freq)}
                  className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? "bg-surface-elevated text-foreground shadow-xs"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {freq === "all" ? "All Freq" : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              );
            })}
          </div>

          {isFiltered ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setTypeFilter("all");
                setFrequencyFilter("all");
              }}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-expense/40 hover:bg-expense/10 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>Reset</span>
            </button>
          ) : null}
        </div>
      )}

      {accountItems.length === 0 ? (
        <div className="rounded-xl border border-accent/25 bg-accent-glow px-4 py-3 text-sm text-foreground-muted">
          Create an account before adding a recurring transaction. Every occurrence needs an account
          to post into.
        </div>
      ) : null}

      {rules.error === null ? null : (
        <p
          role="alert"
          className="rounded-xl border border-expense/25 bg-expense/10 p-3 text-sm text-expense"
        >
          Could not refresh recurring rules. Showing the last available list.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No matching rules" : "No recurring rules yet"}
          description={
            isFiltered
              ? "No recurring rules match your search query or status filter."
              : "Automate predictable money movements like rent, salary, and subscriptions. You can pause any rule without losing its history."
          }
          action={
            <Button type="button" onClick={openCreate} disabled={accountItems.length === 0}>
              <span className="mr-1 text-base leading-none">+</span> Create recurring rule
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((rule) => (
            <RecurringRuleCard
              key={rule.id}
              rule={rule}
              {...optionalAccount(accountMap.get(rule.template.accountId))}
              {...optionalCategory(
                rule.template.categoryId === undefined
                  ? undefined
                  : categoryMap.get(rule.template.categoryId)
              )}
              isUpdating={updateRule.isPending && updateRule.variables?.ruleId === rule.id}
              onEdit={() => openEdit(rule)}
              onTogglePause={() => void togglePause(rule)}
            />
          ))}
        </div>
      )}

      {drawerOpen ? (
        <RecurringRuleDrawer
          accounts={accountItems}
          categories={categoryItems}
          {...(editing === undefined ? {} : { rule: editing })}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </section>
  );
}

function RecurringRuleCard({
  rule,
  account,
  category,
  isUpdating,
  onEdit,
  onTogglePause
}: Readonly<{
  rule: RecurringRule;
  account?: Account;
  category?: Category;
  isUpdating: boolean;
  onEdit: () => void;
  onTogglePause: () => void;
}>): ReactNode {
  const isCompleted =
    rule.isPaused &&
    rule.lastRunAt !== undefined &&
    rule.lastRunAt.getTime() === rule.nextRunAt.getTime();
  const parsed = parseSchedule(rule.rrule, rule.startAt);
  const scheduleLabel = parsed === null ? rule.rrule : describeSchedule(parsed);
  const period = parsed === null ? "scheduled" : periodLabel(parsed.frequency);
  const icon =
    category === undefined ? (rule.template.type === "expense" ? "↗" : "↙") : glyphFor(category);
  const iconStyle =
    category?.color === undefined ? undefined : { backgroundColor: tint(category.color) };

  return (
    <article
      className={`glass-card rounded-2xl p-4.5 shadow-xs transition-all duration-200 sm:p-5.5 ${
        rule.isPaused
          ? "border-border opacity-75 hover:opacity-100"
          : "border-border/80 hover:border-accent/40 hover:shadow-sm"
      }`}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <span
            style={iconStyle}
            className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border text-lg shadow-2xs ${
              category?.color === undefined ? "bg-surface-muted" : ""
            }`}
          >
            <IconGlyph value={icon} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold tracking-tight text-foreground">
                {rule.template.description}
              </h2>
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-2xs font-bold tracking-wider uppercase ${
                  rule.template.type === "expense"
                    ? "bg-expense/10 text-expense border border-expense/20"
                    : "bg-income/10 text-income border border-income/20"
                }`}
              >
                {rule.template.type}
              </span>
              {rule.isPaused ? (
                <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                  {isCompleted ? "Completed" : "Paused"}
                </span>
              ) : (
                <span className="rounded-md border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-income uppercase">
                  Active
                </span>
              )}
              {rule.autoPost ? (
                <span className="rounded-md border border-border/80 bg-surface-muted/60 px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                  ⚡ Auto-Post
                </span>
              ) : (
                <span
                  title="No transaction is posted for you — link one from its detail panel, or it gets matched automatically."
                  className="rounded-md border border-accent/30 bg-accent-glow px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-accent uppercase"
                >
                  Manual
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <span className="font-semibold text-foreground">{scheduleLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 rounded bg-surface-muted/80 px-1.5 py-0.5 font-mono text-2xs text-foreground-muted border border-border/60">
                🏦 {account?.name ?? "Unknown account"}
              </span>
              {category !== undefined ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-foreground-muted">{category.name}</span>
                </>
              ) : null}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-foreground-muted">
              <span className="inline-flex items-center gap-1">
                <span className="text-foreground-muted/80">Next:</span>
                <strong className={rule.isPaused ? "text-foreground-muted" : "text-accent"}>
                  {rule.isPaused
                    ? isCompleted
                      ? "Schedule completed"
                      : "No upcoming runs"
                    : `Next ${dateFormatter.format(rule.nextRunAt)}`}
                </strong>
              </span>
              <span>·</span>
              <span>
                {rule.lastRunAt === undefined
                  ? "Not posted yet"
                  : `Last posted ${dateFormatter.format(rule.lastRunAt)}`}
              </span>
            </div>

            {rule.autoPost ? null : (
              <div className="mt-2">
                <OccurrenceTickRow ruleId={rule.id} />
              </div>
            )}
          </div>
        </div>

        {/* Amount & Actions */}
        <div className="flex flex-col items-stretch gap-3 border-t border-border/70 pt-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-5 md:flex-col md:items-end md:border-0 md:pt-0">
          <div className="text-left sm:text-right">
            <Money
              minor={rule.template.amountMinor}
              variant={rule.template.type}
              signed
              size="lg"
            />
            <p className="mt-0.5 font-mono text-2xs text-foreground-muted">per {period}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {isCompleted ? null : (
              <button
                type="button"
                onClick={onTogglePause}
                disabled={isUpdating}
                className="min-h-10 rounded-xl border border-border/80 bg-surface-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground-muted transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                {isUpdating ? "Saving…" : rule.isPaused ? "Resume" : "Pause"}
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="min-h-10 rounded-xl border border-border/80 bg-surface-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function periodLabel(frequency: "daily" | "weekly" | "monthly" | "yearly"): string {
  const periods = { daily: "day", weekly: "week", monthly: "month", yearly: "year" } as const;
  return periods[frequency];
}

function optionalAccount(account: Account | undefined): Readonly<{ account?: Account }> {
  return account === undefined ? {} : { account };
}

function optionalCategory(category: Category | undefined): Readonly<{ category?: Category }> {
  return category === undefined ? {} : { category };
}

"use client";

import type { Account, Category, RecurringRule } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { useAccounts } from "@/features/accounts";
import { glyphFor, IconGlyph, tint, useCategories } from "@/features/categories";

import { useRecurringRules, useUpdateRecurringRule } from "../hooks/use-recurring-rules";
import { describeSchedule, parseSchedule } from "../model/schedule";
import { RecurringRuleDrawer } from "./recurring-rule-drawer";

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
}>;

export function RecurringManager({ initialRules, accounts, categories }: ManagerProps): ReactNode {
  const rules = useRecurringRules(initialRules);
  const accountQuery = useAccounts(accounts.length === 0 ? undefined : accounts);
  const categoryQuery = useCategories(categories.length === 0 ? undefined : categories);
  const updateRule = useUpdateRecurringRule();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule>();
  const items = rules.data ?? initialRules;
  const accountItems = accountQuery.data ?? accounts;
  const categoryItems = categoryQuery.data ?? categories;
  const activeCount = items.filter((rule) => !rule.isPaused).length;
  const pausedCount = items.length - activeCount;
  const accountMap = new Map(accountItems.map((account) => [account.id, account]));
  const categoryMap = new Map(categoryItems.map((category) => [category.id, category]));

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
      await updateRule.mutateAsync({ ruleId: rule.id, patch: { isPaused: !rule.isPaused } });
      toast.success(rule.isPaused ? "Recurring rule resumed" : "Recurring rule paused");
    } catch {
      toast.error(rule.isPaused ? "Could not resume this rule" : "Could not pause this rule");
    }
  }

  return (
    <section className="mx-auto max-w-[1080px] space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
            Ledger · Automation
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Recurring
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            Rent, salary, subscriptions — set the amount and schedule once, and each occurrence
            posts itself. Pause anytime.
          </p>
        </div>
        <Button type="button" onClick={openCreate} disabled={accountItems.length === 0}>
          <span className="mr-1 text-base leading-none">+</span> New rule
        </Button>
      </header>

      {items.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-surface-muted px-5 py-4">
          <div>
            <span className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
              Total rules
            </span>
            <p className="mt-0.5 text-xl font-bold text-foreground">{items.length}</p>
          </div>
          <div className="h-8 w-px bg-border" aria-hidden="true" />
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <span className="h-2 w-2 rounded-full bg-income" aria-hidden="true" />
            <span className="font-semibold text-foreground">{activeCount}</span> active
          </p>
          {pausedCount === 0 ? null : (
            <p className="flex items-center gap-2 text-sm text-foreground-muted">
              <span className="h-2 w-2 rounded-full bg-foreground-muted" aria-hidden="true" />
              <span className="font-semibold text-foreground">{pausedCount}</span> paused
            </p>
          )}
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
          title="No recurring rules yet"
          description="Automate predictable money movements like rent, salary, and subscriptions. You can pause any rule without losing its history."
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
      className={`rounded-2xl border bg-surface-elevated p-5 transition-colors sm:p-6 ${
        rule.isPaused ? "border-border opacity-75" : "border-border hover:border-accent/35"
      }`}
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <span
            style={iconStyle}
            className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border text-lg ${
              category?.color === undefined ? "bg-surface-muted" : ""
            }`}
          >
            <IconGlyph value={icon} size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-foreground">
                {rule.template.description}
              </h2>
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase ${
                  rule.template.type === "expense"
                    ? "bg-expense/10 text-expense"
                    : "bg-income/10 text-income"
                }`}
              >
                {rule.template.type}
              </span>
              {rule.isPaused ? (
                <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
                  {isCompleted ? "Completed" : "Paused"}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm text-foreground-muted">
              {scheduleLabel} <span aria-hidden="true">·</span> {account?.name ?? "Unknown account"}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-foreground-muted">
              <span>
                {rule.isPaused
                  ? isCompleted
                    ? "Schedule completed"
                    : "No upcoming runs"
                  : `Next ${dateFormatter.format(rule.nextRunAt)}`}
              </span>
              <span>
                {rule.lastRunAt === undefined
                  ? "Not posted yet"
                  : `Last posted ${dateFormatter.format(rule.lastRunAt)}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 border-t border-border pt-4 md:flex-col md:items-end md:border-0 md:pt-0">
          <div className="text-right">
            <Money
              minor={rule.template.amountMinor}
              variant={rule.template.type}
              signed
              size="lg"
            />
            <p className="mt-0.5 text-xs text-foreground-muted">per {period}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted ? null : (
              <button
                type="button"
                onClick={onTogglePause}
                disabled={isUpdating}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground-muted hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {isUpdating ? "Saving…" : rule.isPaused ? "Resume" : "Pause"}
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-accent/40 hover:text-accent"
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

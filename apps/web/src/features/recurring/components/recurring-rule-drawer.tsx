"use client";

import {
  CreateRecurringRuleSchema,
  UpdateRecurringRuleSchema,
  type Account,
  type Category,
  type RecurringRule,
  type TransactionType
} from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateRecurringRule, useUpdateRecurringRule } from "../hooks/use-recurring-rules";
import {
  buildSchedule,
  dateInputToUtc,
  FREQUENCIES,
  parseSchedule,
  todayInIndia,
  utcToDateInput,
  WEEKDAYS,
  type Ending,
  type Frequency,
  type ScheduleDraft,
  type Weekday
} from "../model/schedule";

const selectClasses =
  "w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";
const numberClasses =
  "w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 font-mono text-sm font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const fieldLabelClasses =
  "mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.22em] text-foreground-muted uppercase";

const weekdayLabels: Record<Weekday, string> = {
  MO: "M",
  TU: "T",
  WE: "W",
  TH: "T",
  FR: "F",
  SA: "S",
  SU: "S"
};

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

type DrawerProps = Readonly<{
  accounts: readonly Account[];
  categories: readonly Category[];
  rule?: RecurringRule;
  onClose: () => void;
}>;

function initialSchedule(rule: RecurringRule | undefined): ScheduleDraft {
  if (rule !== undefined) {
    const parsed = parseSchedule(rule.rrule, rule.startAt);
    if (parsed !== null) return parsed;
  }
  return {
    startDate: rule === undefined ? todayInIndia() : utcToDateInput(rule.startAt),
    frequency: "monthly",
    interval: 1,
    weekdays: [],
    monthDays: [1],
    yearMonth: 1,
    ending: "never",
    untilDate: "",
    count: 1
  };
}

export function RecurringRuleDrawer({
  accounts,
  categories,
  rule,
  onClose
}: DrawerProps): ReactNode {
  const createRule = useCreateRecurringRule();
  const updateRule = useUpdateRecurringRule();
  const parsedExisting = rule === undefined ? undefined : parseSchedule(rule.rrule, rule.startAt);
  const [type, setType] = useState<TransactionType>(rule?.template.type ?? "expense");
  const [amountMinor, setAmountMinor] = useState(rule?.template.amountMinor ?? 0);
  const [accountId, setAccountId] = useState(rule?.template.accountId ?? "");
  const [categoryId, setCategoryId] = useState(rule?.template.categoryId ?? "");
  const [description, setDescription] = useState(rule?.template.description ?? "");
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => initialSchedule(rule));
  const [error, setError] = useState<string>();

  const availableAccounts = accounts.filter(
    (account) => !account.isArchived || account.id === accountId
  );
  const availableCategories = categories.filter(
    (category) => category.kind === type && (!category.isArchived || category.id === categoryId)
  );
  const scheduleResult = buildSchedule(schedule);
  const isPending = createRule.isPending || updateRule.isPending;

  function patchSchedule(patch: Partial<ScheduleDraft>): void {
    setSchedule((current) => ({ ...current, ...patch }));
    setError(undefined);
  }

  function changeType(next: TransactionType): void {
    setType(next);
    setCategoryId("");
    setError(undefined);
  }

  function toggleWeekday(day: Weekday): void {
    patchSchedule({
      weekdays: schedule.weekdays.includes(day)
        ? schedule.weekdays.filter((value) => value !== day)
        : [...schedule.weekdays, day]
    });
  }

  function toggleMonthDay(day: number): void {
    patchSchedule({
      monthDays: schedule.monthDays.includes(day)
        ? schedule.monthDays.filter((value) => value !== day)
        : [...schedule.monthDays, day]
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!scheduleResult.success) {
      setError(scheduleResult.message);
      return;
    }
    if (rule !== undefined && rule.template.categoryId !== undefined && categoryId === "") {
      setError("Removing a category from an existing rule is not supported yet.");
      return;
    }

    const template = {
      accountId,
      ...(categoryId === "" ? {} : { categoryId }),
      type,
      amountMinor,
      description,
      tags: rule?.template.tags ?? []
    };

    try {
      if (rule === undefined) {
        const parsed = CreateRecurringRuleSchema.safeParse({
          template,
          rrule: scheduleResult.rrule,
          startAt: dateInputToUtc(schedule.startDate)
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the rule details.");
          return;
        }
        await createRule.mutateAsync(parsed.data);
        toast.success("Recurring rule created");
      } else {
        const parsed = UpdateRecurringRuleSchema.safeParse({
          template,
          rrule: scheduleResult.rrule
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the rule details.");
          return;
        }
        await updateRule.mutateAsync({ ruleId: rule.id, patch: parsed.data });
        toast.success("Recurring rule updated");
      }
      onClose();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save this recurring rule.");
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-rule-title"
        className="h-screen w-full max-w-[520px] overflow-y-auto border-l border-border bg-surface-elevated px-5 py-6 animate-drawer-in sm:px-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-accent uppercase">
              Ledger automation
            </p>
            <h2 id="recurring-rule-title" className="mt-1.5 text-xl font-bold text-foreground">
              {rule === undefined ? "New recurring rule" : "Edit recurring rule"}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-foreground-muted">
              Each occurrence posts automatically on its scheduled date.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-6">
          <section className="space-y-5">
            <div>
              <span className={fieldLabelClasses}>Transaction type</span>
              <div className="grid grid-cols-2 gap-2">
                {(["expense", "income"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={type === value}
                    onClick={() => changeType(value)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      type === value
                        ? "border-accent bg-accent-glow text-accent"
                        : "border-border text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {value === "expense" ? "Expense" : "Income"}
                  </button>
                ))}
              </div>
            </div>

            <AmountInput
              id="recurring-amount"
              label="Fixed amount"
              value={amountMinor}
              onChange={setAmountMinor}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={fieldLabelClasses}>Account</span>
                <select
                  className={selectClasses}
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  <option value="">Choose an account</option>
                  {availableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.isArchived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={fieldLabelClasses}>Category</span>
                <select
                  className={selectClasses}
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {availableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.isArchived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Input
              id="recurring-description"
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Monthly rent"
              maxLength={500}
            />
          </section>

          <section className="space-y-5 border-t border-border pt-6">
            <div>
              <p className="text-sm font-bold text-foreground">Schedule</p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Choose a cadence that matches when the transaction should post.
              </p>
            </div>

            {parsedExisting === null ? (
              <p className="rounded-xl border border-accent/25 bg-accent-glow px-3.5 py-3 text-xs leading-relaxed text-foreground-muted">
                This rule uses an advanced RRULE. Saving will replace it with the schedule selected
                below.
              </p>
            ) : null}

            <label>
              <span className={fieldLabelClasses}>Starts on</span>
              <input
                type="date"
                value={schedule.startDate}
                readOnly={rule !== undefined}
                onChange={(event) => patchSchedule({ startDate: event.target.value })}
                className={`${numberClasses} read-only:cursor-not-allowed read-only:opacity-60`}
              />
              {rule === undefined ? null : (
                <span className="mt-1.5 block text-xs text-foreground-muted">
                  The API keeps the original start date fixed after creation.
                </span>
              )}
            </label>

            <div>
              <span className={fieldLabelClasses}>Repeats</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FREQUENCIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={schedule.frequency === value}
                    onClick={() => patchSchedule({ frequency: value })}
                    className={`rounded-lg border px-2.5 py-2 text-xs font-semibold capitalize ${
                      schedule.frequency === value
                        ? "border-accent bg-accent-glow text-accent"
                        : "border-border text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <label>
              <span className={fieldLabelClasses}>Every</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={schedule.interval}
                  onChange={(event) => patchSchedule({ interval: event.target.valueAsNumber })}
                  className={`${numberClasses} max-w-24`}
                />
                <span className="text-sm text-foreground-muted">
                  {intervalUnit(schedule.frequency, schedule.interval)}
                </span>
              </div>
            </label>

            {schedule.frequency === "weekly" ? (
              <div>
                <span className={fieldLabelClasses}>On weekdays</span>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-label={day}
                      aria-pressed={schedule.weekdays.includes(day)}
                      onClick={() => toggleWeekday(day)}
                      className={`aspect-square rounded-lg border font-mono text-xs font-bold ${
                        schedule.weekdays.includes(day)
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      {weekdayLabels[day]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {schedule.frequency === "monthly" ? (
              <div>
                <span className={fieldLabelClasses}>On day</span>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={schedule.monthDays.includes(day)}
                      onClick={() => toggleMonthDay(day)}
                      className={`aspect-square rounded-md border font-mono text-[11px] font-semibold ${
                        schedule.monthDays.includes(day)
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-foreground-muted">
                  Dates that do not exist in a month are skipped.
                </p>
              </div>
            ) : null}

            {schedule.frequency === "yearly" ? (
              <label>
                <span className={fieldLabelClasses}>In month</span>
                <select
                  className={selectClasses}
                  value={schedule.yearMonth}
                  onChange={(event) => patchSchedule({ yearMonth: Number(event.target.value) })}
                >
                  {monthLabels.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div>
              <span className={fieldLabelClasses}>Ends</span>
              <div className="grid grid-cols-3 gap-2">
                {(["never", "until", "count"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patchSchedule({ ending: value })}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${
                      schedule.ending === value
                        ? "border-accent bg-accent-glow text-accent"
                        : "border-border text-foreground-muted"
                    }`}
                  >
                    {value === "count" ? "After count" : value}
                  </button>
                ))}
              </div>
            </div>

            <EndingField ending={schedule.ending} schedule={schedule} onChange={patchSchedule} />

            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
                Schedule summary
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {scheduleResult.success ? scheduleResult.summary : scheduleResult.message}
              </p>
              <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-foreground-muted">
                {scheduleResult.success ? scheduleResult.rrule : "RRULE pending"} · DTSTART=
                {schedule.startDate || "pending"}
              </p>
            </div>
          </section>

          {error === undefined ? null : (
            <p
              role="alert"
              className="rounded-xl border border-expense/25 bg-expense/10 p-3 text-sm text-expense"
            >
              {error}
            </p>
          )}

          <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border bg-surface-elevated/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : rule === undefined ? "Create rule" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function intervalUnit(frequency: Frequency, interval: number): string {
  const singular: Record<Frequency, string> = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    yearly: "year"
  };
  const unit = singular[frequency];
  return interval === 1 ? unit : `${unit}s`;
}

function EndingField({
  ending,
  schedule,
  onChange
}: Readonly<{
  ending: Ending;
  schedule: ScheduleDraft;
  onChange: (patch: Partial<ScheduleDraft>) => void;
}>): ReactNode {
  if (ending === "until") {
    return (
      <label>
        <span className={fieldLabelClasses}>Last date</span>
        <input
          type="date"
          min={schedule.startDate}
          value={schedule.untilDate}
          onChange={(event) => onChange({ untilDate: event.target.value })}
          className={numberClasses}
        />
      </label>
    );
  }
  if (ending === "count") {
    return (
      <label>
        <span className={fieldLabelClasses}>Number of occurrences</span>
        <input
          type="number"
          min={1}
          max={9999}
          value={schedule.count}
          onChange={(event) => onChange({ count: event.target.valueAsNumber })}
          className={numberClasses}
        />
      </label>
    );
  }
  return null;
}

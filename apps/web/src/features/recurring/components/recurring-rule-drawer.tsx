"use client";

import {
  CreateRecurringRuleSchema,
  UpdateRecurringRuleSchema,
  type Account,
  type Category,
  type RecurringRule,
  type TransactionType
} from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "@/lib/toast";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { userErrorMessage } from "@/lib/errors";

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

const numberClasses =
  "min-h-11 w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 font-mono text-base font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm";
const fieldLabelClasses =
  "mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.22em] text-foreground-muted uppercase";

const weekdayLabels: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun"
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
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? true);
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
          startAt: dateInputToUtc(schedule.startDate),
          autoPost
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
          rrule: scheduleResult.rrule,
          autoPost
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
      setError(userErrorMessage(caught, "Could not save this recurring rule."));
    }
  }

  return (
    <DialogSurface
      variant="drawer"
      labelledBy="recurring-rule-title"
      onClose={onClose}
      panelClassName="max-w-[520px]"
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
          aria-label="Close recurring rule"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                  className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
            <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              <span>Account</span>
              <Select
                name="accountId"
                aria-label="Account"
                options={[
                  { value: "", label: "Choose an account" },
                  ...availableAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.name}${account.isArchived ? " (archived)" : ""}`
                  }))
                ]}
                placeholder="Choose an account"
                value={accountId}
                onChange={setAccountId}
              />
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              <span>Category</span>
              <Select
                name="categoryId"
                aria-label="Category"
                options={[
                  { value: "", label: "Uncategorised" },
                  ...availableCategories.map((category) => ({
                    value: category.id,
                    label: `${category.name}${category.isArchived ? " (archived)" : ""}`
                  }))
                ]}
                placeholder="Uncategorised"
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
          </div>

          <Input
            id="recurring-description"
            label="Description"
            value={description}
            name="description"
            autoComplete="off"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Monthly rent…"
            maxLength={500}
          />

          <div>
            <span className={fieldLabelClasses}>Posting</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={autoPost}
                onClick={() => setAutoPost(true)}
                className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  autoPost
                    ? "border-accent bg-accent-glow text-accent"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                Post automatically
              </button>
              <button
                type="button"
                aria-pressed={!autoPost}
                onClick={() => setAutoPost(false)}
                className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  !autoPost
                    ? "border-accent bg-accent-glow text-accent"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                I&rsquo;ll log it myself
              </button>
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              {autoPost
                ? "Each occurrence posts a transaction automatically on its scheduled date."
                : "No transaction is posted for you. Each occurrence just gets tracked as expected — link an existing transaction to it (or a matching one gets linked automatically) from the transaction's detail panel. Use this if something else, like an email-ingestion pipeline, already posts these transactions."}
            </p>
          </div>
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

          <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>Starts on</span>
            <DatePicker
              name="startDate"
              aria-label="Starts on"
              placeholder="Starts on"
              disabled={rule !== undefined}
              value={schedule.startDate}
              onChange={(val) => patchSchedule({ startDate: val })}
            />
            {rule === undefined ? null : (
              <span className="mt-1.5 block text-xs text-foreground-muted">
                The API keeps the original start date fixed after creation.
              </span>
            )}
          </div>

          <div>
            <span className={fieldLabelClasses}>Repeats</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FREQUENCIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={schedule.frequency === value}
                  onClick={() => patchSchedule({ frequency: value })}
                  className={`min-h-11 rounded-lg border px-2.5 py-2 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
                name="interval"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={365}
                value={schedule.interval}
                onChange={(event) =>
                  patchSchedule({
                    interval: Number.isNaN(event.target.valueAsNumber)
                      ? 1
                      : event.target.valueAsNumber
                  })
                }
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
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={day}
                    aria-pressed={schedule.weekdays.includes(day)}
                    onClick={() => toggleWeekday(day)}
                    className={`min-h-11 rounded-lg border font-mono text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={schedule.monthDays.includes(day)}
                    onClick={() => toggleMonthDay(day)}
                    className={`min-h-11 rounded-md border font-mono text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
            <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              <span>In month</span>
              <Select
                name="yearMonth"
                aria-label="In month"
                options={monthLabels.map((month, index) => ({
                  value: String(index + 1),
                  label: month
                }))}
                value={String(schedule.yearMonth)}
                onChange={(val) => patchSchedule({ yearMonth: Number(val) })}
              />
            </div>
          ) : null}

          <div>
            <span className={fieldLabelClasses}>Ends</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["never", "until", "count"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patchSchedule({ ending: value })}
                  className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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

        <div className="safe-area-bottom sticky bottom-0 -mx-5 flex gap-2 border-t border-border bg-surface-elevated/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:justify-end sm:px-8">
          <Button
            className="flex-1 sm:flex-none"
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button className="flex-1 sm:flex-none" type="submit" disabled={isPending}>
            {isPending ? "Saving…" : rule === undefined ? "Create rule" : "Save changes"}
          </Button>
        </div>
      </form>
    </DialogSurface>
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
      <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
        <span>Last date</span>
        <DatePicker
          name="untilDate"
          aria-label="Last date"
          placeholder="Last date"
          minDate={schedule.startDate}
          value={schedule.untilDate}
          onChange={(val) => onChange({ untilDate: val })}
        />
      </div>
    );
  }
  if (ending === "count") {
    return (
      <label>
        <span className={fieldLabelClasses}>Number of occurrences</span>
        <input
          name="count"
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={1}
          max={9999}
          value={schedule.count}
          onChange={(event) =>
            onChange({
              count: Number.isNaN(event.target.valueAsNumber) ? 1 : event.target.valueAsNumber
            })
          }
          className={numberClasses}
        />
      </label>
    );
  }
  return null;
}

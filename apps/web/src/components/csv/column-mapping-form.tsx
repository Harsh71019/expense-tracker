"use client";

import {
  COLUMN_MAPPING_PRESETS,
  ColumnMappingSchema,
  DateFormatSchema,
  type ColumnMapping
} from "@treasury-ops/shared";
import { useEffect, useEffectEvent, useState } from "react";
import type { ReactNode } from "react";

import { Select } from "@/components/ui/select";
const inputClasses =
  "min-h-11 w-full rounded-[11px] border border-border bg-surface-muted px-3.5 py-3 font-mono text-base text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-[15px]";
const labelClasses = "mb-2 mt-5 block text-xs font-semibold text-foreground";

type MappingDraft = Readonly<{
  date: string;
  description: string;
  dateFormat: ColumnMapping["dateFormat"] | "";
  amountConvention: ColumnMapping["amountConvention"];
  amount: string;
  debit: string;
  credit: string;
}>;

const emptyDraft: MappingDraft = {
  date: "",
  description: "",
  dateFormat: "",
  amountConvention: "debit_credit_cols",
  amount: "",
  debit: "",
  credit: ""
};

function fromMapping(mapping: ColumnMapping): MappingDraft {
  return {
    date: mapping.date,
    description: mapping.description,
    dateFormat: mapping.dateFormat,
    amountConvention: mapping.amountConvention,
    amount: mapping.amount ?? "",
    debit: mapping.debit ?? "",
    credit: mapping.credit ?? ""
  };
}

function toMapping(draft: MappingDraft): unknown {
  return draft.amountConvention === "single_signed"
    ? {
        date: draft.date,
        description: draft.description,
        dateFormat: draft.dateFormat,
        amountConvention: draft.amountConvention,
        amount: draft.amount
      }
    : {
        date: draft.date,
        description: draft.description,
        dateFormat: draft.dateFormat,
        amountConvention: draft.amountConvention,
        debit: draft.debit,
        credit: draft.credit
      };
}

export function ColumnMappingForm({
  initialMapping,
  onChange,
  savedMappingLabel
}: Readonly<{
  initialMapping?: ColumnMapping;
  onChange: (mapping: ColumnMapping | undefined, error: string | undefined) => void;
  savedMappingLabel?: string;
}>): ReactNode {
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<MappingDraft>(emptyDraft);
  const effectiveDraft = dirty
    ? draft
    : initialMapping === undefined
      ? draft
      : fromMapping(initialMapping);
  const notifyChange = useEffectEvent(onChange);

  useEffect(() => {
    const parsed = ColumnMappingSchema.safeParse(toMapping(effectiveDraft));
    notifyChange(
      parsed.success ? parsed.data : undefined,
      parsed.success ? undefined : (parsed.error.issues[0]?.message ?? "Check column mapping.")
    );
  }, [effectiveDraft]);

  function update(next: MappingDraft): void {
    setDirty(true);
    setDraft(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-foreground-muted">
          Start from a bank preset:
        </span>
        {Object.entries(COLUMN_MAPPING_PRESETS).map(([name, preset]) => (
          <button
            key={name}
            type="button"
            onClick={() => update(fromMapping(preset))}
            className="min-h-11 rounded-[9px] border border-border bg-accent-glow px-4 py-2 text-[13px] font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {name.toUpperCase()}
          </button>
        ))}
      </div>

      {!dirty && initialMapping !== undefined && savedMappingLabel !== undefined ? (
        <p className="mt-4 text-sm text-foreground-muted" aria-live="polite">
          {savedMappingLabel}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="map-date" className={labelClasses}>
            Date column
          </label>
          <input
            id="map-date"
            name="dateColumn"
            autoComplete="off"
            value={effectiveDraft.date}
            onChange={(event) => update({ ...effectiveDraft, date: event.target.value })}
            placeholder="Date…"
            className={inputClasses}
          />
        </div>
        <div>
          <span className={labelClasses}>Date format</span>
          <Select
            id="map-date-format"
            name="dateFormat"
            options={[
              { value: "", label: "Select a format", disabled: true },
              ...DateFormatSchema.options.map((format) => ({ value: format, label: format }))
            ]}
            placeholder="Select a format"
            value={effectiveDraft.dateFormat}
            onChange={(val) => {
              const value = DateFormatSchema.safeParse(val);
              if (value.success) update({ ...effectiveDraft, dateFormat: value.data });
            }}
          />
        </div>
      </div>

      <label htmlFor="map-description" className={labelClasses}>
        Description column
      </label>
      <input
        id="map-description"
        name="descriptionColumn"
        autoComplete="off"
        value={effectiveDraft.description}
        onChange={(event) => update({ ...effectiveDraft, description: event.target.value })}
        placeholder="Narration…"
        className={inputClasses}
      />

      <span className={labelClasses}>How are amounts stored?</span>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {(
          [
            {
              key: "single_signed" as const,
              title: "One signed column",
              desc: "A single amount, negative for debits"
            },
            {
              key: "debit_credit_cols" as const,
              title: "Separate debit / credit",
              desc: "Two columns, one for each direction"
            }
          ] as const
        ).map((option) => {
          const selected = effectiveDraft.amountConvention === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ ...effectiveDraft, amountConvention: option.key })}
              className={`min-h-11 flex-1 rounded-xl border px-4 py-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected ? "border-accent bg-accent-glow" : "border-border bg-surface-muted"
              }`}
            >
              <div
                className={
                  selected
                    ? "text-sm font-semibold text-accent"
                    : "text-sm font-semibold text-foreground"
                }
              >
                {option.title}
              </div>
              <div className="mt-0.5 text-xs text-foreground-muted">{option.desc}</div>
            </button>
          );
        })}
      </div>

      {effectiveDraft.amountConvention === "single_signed" ? (
        <div>
          <label htmlFor="map-amount" className={labelClasses}>
            Signed amount column
          </label>
          <input
            id="map-amount"
            name="amountColumn"
            autoComplete="off"
            value={effectiveDraft.amount}
            onChange={(event) => update({ ...effectiveDraft, amount: event.target.value })}
            placeholder="Amount…"
            className={inputClasses}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="map-debit" className={labelClasses}>
              Debit (withdrawal) column
            </label>
            <input
              id="map-debit"
              name="debitColumn"
              autoComplete="off"
              value={effectiveDraft.debit}
              onChange={(event) => update({ ...effectiveDraft, debit: event.target.value })}
              placeholder="Withdrawal amount…"
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="map-credit" className={labelClasses}>
              Credit (deposit) column
            </label>
            <input
              id="map-credit"
              name="creditColumn"
              autoComplete="off"
              value={effectiveDraft.credit}
              onChange={(event) => update({ ...effectiveDraft, credit: event.target.value })}
              placeholder="Deposit amount…"
              className={inputClasses}
            />
          </div>
        </div>
      )}
    </div>
  );
}

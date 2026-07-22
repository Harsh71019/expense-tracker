"use client";

import {
  COLUMN_MAPPING_PRESETS,
  ColumnMappingSchema,
  DateFormatSchema,
  type ColumnMapping
} from "@treasury-ops/shared";
import { useEffect, useEffectEvent, useState } from "react";
import type { ReactNode } from "react";

import { useSavedImportMapping } from "../hooks/use-saved-import-mapping";

const selectClasses =
  "w-full rounded-[11px] border border-border bg-surface-muted px-3.5 py-3 text-[15px] font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const inputClasses =
  "w-full rounded-[11px] border border-border bg-surface-muted px-3.5 py-3 font-mono text-[15px] text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
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

type MapStepProps = Readonly<{
  accountId: string;
  accountName: string;
  onChange: (mapping: ColumnMapping | undefined, error: string | undefined) => void;
}>;

export function MapStep({ accountId, accountName, onChange }: MapStepProps): ReactNode {
  const savedMapping = useSavedImportMapping(accountId);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<MappingDraft>(emptyDraft);

  const savedDraft =
    savedMapping.data?.mapping === null || savedMapping.data === undefined
      ? undefined
      : fromMapping(savedMapping.data.mapping);
  const effectiveDraft = dirty ? draft : (savedDraft ?? draft);
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

  function applyPreset(preset: ColumnMapping): void {
    update(fromMapping(preset));
  }

  return (
    <div className="mt-5.5 animate-fade-in rounded-[18px] border border-border bg-surface-elevated p-6.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-foreground-muted">
          Start from a bank preset:
        </span>
        {Object.entries(COLUMN_MAPPING_PRESETS).map(([name, preset]) => (
          <button
            key={name}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-[9px] border border-border bg-accent-glow px-4 py-2 text-[13px] font-semibold text-accent"
          >
            {name.toUpperCase()}
          </button>
        ))}
        <span className="mt-0.5 basis-full text-xs text-foreground-muted">
          Editable after — presets are a starting point, not a guarantee.
        </span>
      </div>

      {!dirty && savedDraft !== undefined ? (
        <p className="mt-4 text-sm text-foreground-muted" aria-live="polite">
          Using your last mapping for {accountName}.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="map-date" className={labelClasses}>
            Date column
          </label>
          <input
            id="map-date"
            value={effectiveDraft.date}
            onChange={(event) => update({ ...effectiveDraft, date: event.target.value })}
            placeholder="e.g. Date"
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="map-date-format" className={labelClasses}>
            Date format
          </label>
          <select
            id="map-date-format"
            value={effectiveDraft.dateFormat}
            onChange={(event) => {
              const value = DateFormatSchema.safeParse(event.target.value);
              if (value.success) update({ ...effectiveDraft, dateFormat: value.data });
            }}
            className={selectClasses}
          >
            <option value="" disabled>
              Select a format
            </option>
            {DateFormatSchema.options.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="map-description" className={labelClasses}>
        Description column
      </label>
      <input
        id="map-description"
        value={effectiveDraft.description}
        onChange={(event) => update({ ...effectiveDraft, description: event.target.value })}
        placeholder="e.g. Narration"
        className={inputClasses}
      />

      <span className={labelClasses}>How are amounts stored?</span>
      <div className="flex gap-2.5">
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
              className={`flex-1 rounded-xl border px-4 py-3.5 text-left transition-colors duration-150 ${
                selected ? "border-accent bg-accent-glow" : "border-border bg-surface-muted"
              }`}
            >
              <div
                className={`text-sm font-semibold ${selected ? "text-accent" : "text-foreground"}`}
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
            value={effectiveDraft.amount}
            onChange={(event) => update({ ...effectiveDraft, amount: event.target.value })}
            placeholder="e.g. Amount"
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
              value={effectiveDraft.debit}
              onChange={(event) => update({ ...effectiveDraft, debit: event.target.value })}
              placeholder="e.g. Withdrawal Amt."
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="map-credit" className={labelClasses}>
              Credit (deposit) column
            </label>
            <input
              id="map-credit"
              value={effectiveDraft.credit}
              onChange={(event) => update({ ...effectiveDraft, credit: event.target.value })}
              placeholder="e.g. Deposit Amt."
              className={inputClasses}
            />
          </div>
        </div>
      )}
    </div>
  );
}

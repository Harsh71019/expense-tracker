"use client";

import {
  AmountConventionSchema,
  ColumnMappingSchema,
  DateFormatSchema,
  type AmountConvention,
  type ColumnMapping,
  type DateFormat
} from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";

type MappingDraft = Readonly<{
  date: string;
  description: string;
  dateFormat: DateFormat | "";
  amountConvention: AmountConvention;
  amount: string;
  debit: string;
  credit: string;
}>;
const emptyDraft: MappingDraft = {
  date: "",
  description: "",
  dateFormat: "",
  amountConvention: "single_signed",
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

export function MappingForm({
  onChange,
  initialMapping
}: Readonly<{
  onChange: (mapping: ColumnMapping | undefined, error: string | undefined) => void;
  initialMapping?: ColumnMapping;
}>): ReactNode {
  const [draft, setDraft] = useState<MappingDraft>(
    initialMapping === undefined ? emptyDraft : fromMapping(initialMapping)
  );
  function update(next: MappingDraft): void {
    setDraft(next);
    const parsed = ColumnMappingSchema.safeParse(toMapping(next));
    onChange(
      parsed.success ? parsed.data : undefined,
      parsed.success ? undefined : (parsed.error.issues[0]?.message ?? "Check column mapping.")
    );
  }
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-foreground">CSV columns</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="mapping-date"
          label="Date column"
          value={draft.date}
          onChange={(event) => update({ ...draft, date: event.target.value })}
        />
        <Input
          id="mapping-description"
          label="Description column"
          value={draft.description}
          onChange={(event) => update({ ...draft, description: event.target.value })}
        />
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
        Date format
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          value={draft.dateFormat}
          onChange={(event) => {
            const value = DateFormatSchema.safeParse(event.target.value);
            if (value.success) update({ ...draft, dateFormat: value.data });
          }}
        >
          <option value="" disabled>
            Select the statement date format
          </option>
          {DateFormatSchema.options.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
        Amount convention
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          value={draft.amountConvention}
          onChange={(event) => {
            const value = AmountConventionSchema.safeParse(event.target.value);
            if (value.success) update({ ...draft, amountConvention: value.data });
          }}
        >
          <option value="single_signed">One signed amount column</option>
          <option value="debit_credit_cols">Separate debit and credit columns</option>
        </select>
      </label>
      {draft.amountConvention === "single_signed" ? (
        <Input
          id="mapping-amount"
          label="Amount column"
          value={draft.amount}
          onChange={(event) => update({ ...draft, amount: event.target.value })}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="mapping-debit"
            label="Debit column"
            value={draft.debit}
            onChange={(event) => update({ ...draft, debit: event.target.value })}
          />
          <Input
            id="mapping-credit"
            label="Credit column"
            value={draft.credit}
            onChange={(event) => update({ ...draft, credit: event.target.value })}
          />
        </div>
      )}
    </fieldset>
  );
}

"use client";

import type { StagedRow as StagedRowType } from "@vyaya/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { useCategories } from "@/features/categories";

import { useUpdateStagedRow } from "../hooks/use-update-staged-row";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata"
});

export function StagedRow({
  batchId,
  row
}: Readonly<{ batchId: string; row: StagedRowType }>): ReactNode {
  const update = useUpdateStagedRow();
  const categories = useCategories();
  const categoryItems = (categories.data ?? []).filter(
    (category) => category.kind === row.parsed?.type
  );
  const raw = Object.entries(row.raw)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
  return (
    <article className="grid gap-3 rounded-xl border border-border bg-surface-elevated p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs text-foreground-muted">Row {row.rowNumber}</p>
          {row.isDuplicate ? <Badge variant="duplicate">Duplicate</Badge> : null}
          {row.problems.map((problem) => (
            <Badge key={problem} variant="problem">
              {problem}
            </Badge>
          ))}
        </div>
        {row.parsed === undefined ? (
          <p className="mt-2 break-words text-sm text-foreground-muted">{raw}</p>
        ) : (
          <>
            <p className="mt-2 truncate font-medium text-foreground">{row.parsed.description}</p>
            <div className="mt-1 flex gap-3 text-sm">
              <span className="text-foreground-muted">
                {dateFormatter.format(row.parsed.occurredAt)}
              </span>
              <Money minor={row.parsed.amountMinor} variant={row.parsed.type} signed />
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={row.include}
            disabled={row.parsed === undefined || update.isPending}
            onChange={() => update.mutate({ batchId, stagedRowId: row.id, include: !row.include })}
          />{" "}
          Include
        </label>
        {row.parsed === undefined ? null : (
          <select
            aria-label={`Category for row ${row.rowNumber}`}
            className="max-w-44 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            value={row.suggestedCategoryId ?? ""}
            disabled={update.isPending}
            onChange={(event) =>
              update.mutate({
                batchId,
                stagedRowId: row.id,
                suggestedCategoryId: event.target.value === "" ? null : event.target.value
              })
            }
          >
            <option value="">No category</option>
            {categoryItems.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </article>
  );
}

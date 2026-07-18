"use client";

import { ExportCsvQuerySchema } from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useExportCsv } from "../hooks/use-export-csv";
import { exportFilename, indiaCalendarDate } from "../model/export";

export function ExportCsvForm(): ReactNode {
  const mutation = useExportCsv();
  const [mode, setMode] = useState<"all" | "range">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = ExportCsvQuerySchema.safeParse(
      mode === "all"
        ? {}
        : {
            ...(from === "" ? {} : { from: indiaCalendarDate(from) }),
            ...(to === "" ? {} : { to: indiaCalendarDate(to) })
          }
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the date range.");
      return;
    }
    if (
      parsed.data.from !== undefined &&
      parsed.data.to !== undefined &&
      parsed.data.from > parsed.data.to
    ) {
      setError("From date must be on or before the to date.");
      return;
    }
    try {
      const csv = await mutation.mutateAsync(parsed.data);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exportFilename;
        anchor.click();
        setStatus("Export prepared. Your browser will handle the download.");
        setError(undefined);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not prepare the export.");
      setStatus(undefined);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Export transactions</h1>
        <p className="mt-1.5 text-sm text-foreground-muted">
          Download posted transactions as a formula-injection-safe CSV with exact signed INR
          amounts.
        </p>
      </header>

      <form
        className="space-y-5 rounded-xl border border-border bg-surface-elevated p-5 sm:p-7"
        onSubmit={submit}
      >
        <fieldset className="space-y-3">
          <legend className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Date range
          </legend>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-4 text-sm">
            <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
            All posted transactions
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-4 text-sm">
            <input type="radio" checked={mode === "range"} onChange={() => setMode("range")} />
            Choose a range
          </label>
        </fieldset>
        {mode === "range" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="export-from"
              label="From (Asia/Kolkata)"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Input
              id="export-to"
              label="To (Asia/Kolkata)"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        ) : null}
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <p aria-live="polite" className="text-sm text-foreground-muted">
          {mutation.isPending ? "Preparing export…" : status}
        </p>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Preparing export…" : "Download CSV"}
        </Button>
      </form>

      <section className="rounded-xl border border-border bg-surface-elevated p-5">
        <h2 className="font-bold">Included columns</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          Date, type, status, account, category, description, tags, and amount. Reversed and
          reversal entries are excluded.
        </p>
      </section>
    </section>
  );
}

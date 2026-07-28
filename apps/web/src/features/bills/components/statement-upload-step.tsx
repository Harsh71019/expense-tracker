"use client";

import { MAX_IMPORT_FILE_SIZE_BYTES, type ColumnMapping } from "@treasury-ops/shared";
import { useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";

import { ColumnMappingForm } from "@/components/csv/column-mapping-form";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { useUploadBillStatement } from "../hooks/use-bill-statement";

export function StatementUploadStep({ billId }: Readonly<{ billId: string }>): ReactNode {
  const upload = useUploadBillStatement(billId);
  const [file, setFile] = useState<File>();
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [mappingError, setMappingError] = useState<string>();
  const [error, setError] = useState<string>();

  function pick(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0];
    if (selected === undefined) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Only issuer CSV statement exports are supported.");
      setFile(undefined);
      return;
    }
    if (selected.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setError("The statement exceeds the 5 MB upload limit.");
      setFile(undefined);
      return;
    }
    setError(undefined);
    setFile(selected);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (file === undefined || mapping === undefined) {
      setError(mappingError ?? "Choose a CSV and complete its column mapping.");
      return;
    }
    try {
      await upload.mutateAsync({ file, mapping });
      toast.success("Statement uploaded for verification");
      setError(undefined);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not upload the statement.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-6">
      <h2 className="text-lg font-bold text-foreground">Upload issuer statement</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        CSV only · up to 5 MB · the backend verifies every row against this bill cycle.
      </p>
      <form className="mt-5" onSubmit={submit}>
        <label
          htmlFor="bill-statement-file"
          className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-border bg-surface-muted p-7 text-center hover:border-accent/60"
        >
          <input
            id="bill-statement-file"
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            onChange={pick}
          />
          <span className="text-2xl text-accent" aria-hidden="true">
            ↥
          </span>
          <span className="mt-2 text-sm font-semibold text-foreground">
            {file?.name ?? "Choose a card statement CSV"}
          </span>
        </label>
        <div className="mt-5">
          <ColumnMappingForm
            onChange={(next, nextError) => {
              setMapping(next);
              setMappingError(nextError);
            }}
          />
        </div>
        {error === undefined ? null : (
          <p role="alert" className="mt-4 text-sm text-expense">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <Button
            type="submit"
            disabled={file === undefined || mapping === undefined || upload.isPending}
          >
            {upload.isPending ? "Uploading…" : "Upload and verify"}
          </Button>
        </div>
      </form>
    </section>
  );
}

"use client";

import { MAX_IMPORT_FILE_SIZE_BYTES, type Account } from "@vyaya/shared";
import { useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";

type FileError = Readonly<{ title: string; body: string }>;

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

function validate(file: File): FileError | undefined {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return {
      title: "Wrong file type",
      body: "Only .csv statement exports are supported. Export your statement as CSV and try again."
    };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return {
      title: "File too large",
      body: "That file is over the 5 MB limit. Split the statement into smaller date ranges and import each."
    };
  }
  return undefined;
}

type UploadStepProps = Readonly<{
  accounts: readonly Account[];
  accountId: string;
  onAccountChange: (accountId: string) => void;
  file: File | undefined;
  onFileChange: (file: File | undefined) => void;
}>;

export function UploadStep({
  accounts,
  accountId,
  onAccountChange,
  file,
  onFileChange
}: UploadStepProps): ReactNode {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<FileError>();

  function pick(picked: File | undefined): void {
    if (picked === undefined) return;
    const fileError = validate(picked);
    if (fileError !== undefined) {
      setError(fileError);
      onFileChange(undefined);
      return;
    }
    setError(undefined);
    onFileChange(picked);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>): void {
    pick(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    pick(event.dataTransfer.files[0]);
  }

  return (
    <div className="mt-5.5 animate-fade-in rounded-[18px] border border-border bg-surface-elevated p-6.5">
      <label
        htmlFor="import-account"
        className="mt-0 mb-2 block text-xs font-semibold text-foreground"
      >
        Which account is this statement for?
      </label>
      <select
        id="import-account"
        value={accountId}
        onChange={(event) => onAccountChange(event.target.value)}
        className="w-full rounded-[11px] border border-border bg-surface-muted px-3.5 py-3 text-[15px] font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <option value="">Select an account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>

      <label
        htmlFor="import-file"
        className="mt-5 mb-2 block text-xs font-semibold text-foreground"
      >
        Statement file
      </label>
      <label
        htmlFor="import-file"
        className={`flex cursor-pointer flex-col items-center rounded-[14px] border-[1.5px] border-dashed p-10 text-center transition-colors ${
          isDragging ? "border-accent bg-accent-glow" : "border-border bg-surface-muted"
        }`}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <input
          id="import-file"
          type="file"
          accept=".csv"
          onChange={onInputChange}
          className="sr-only"
        />
        <span className="mb-2.5 text-3xl text-accent" aria-hidden="true">
          ↥
        </span>
        <span className="mb-1.5 text-[15px] font-semibold text-foreground">
          Drop a .csv file or click to browse
        </span>
        <span className="font-mono text-[12.5px] text-foreground-muted">
          CSV only · up to 5 MB · max 50,000 rows
        </span>
      </label>

      {file === undefined ? null : (
        <div className="mt-4.5 flex items-center gap-3.5 rounded-xl border border-border bg-surface-muted px-4 py-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-glow font-mono text-[11px] font-bold text-accent">
            CSV
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{file.name}</div>
            <div className="mt-0.5 font-mono text-xs text-foreground-muted">
              {formatSize(file.size)} · ready to map
            </div>
          </div>
          <button
            type="button"
            onClick={() => onFileChange(undefined)}
            aria-label="Remove file"
            className="grid h-7.5 w-7.5 shrink-0 place-items-center rounded-lg border border-border bg-surface text-sm text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {error === undefined ? null : (
        <div className="mt-4.5 flex gap-3 rounded-xl border border-expense/30 bg-expense/10 px-4.5 py-3.5">
          <span className="shrink-0 text-[17px] text-expense" aria-hidden="true">
            ⚠
          </span>
          <div>
            <div className="mb-0.5 text-sm font-semibold text-expense">{error.title}</div>
            <div className="text-[13px] leading-relaxed text-foreground-muted">{error.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import type { ColumnMapping } from "@vyaya/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { useAccounts } from "@/features/accounts";

import { useUploadImport } from "../hooks/use-upload-import";
import { useSavedImportMapping } from "../hooks/use-saved-import-mapping";
import { MappingForm } from "./mapping-form";

export function UploadForm(): ReactNode {
  const router = useRouter();
  const accounts = useAccounts();
  const upload = useUploadImport();
  const [file, setFile] = useState<File>();
  const [accountId, setAccountId] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>();
  const [mappingDirty, setMappingDirty] = useState(false);
  const [mappingError, setMappingError] = useState<string>();
  const [error, setError] = useState<string>();
  const accountItems = accounts.data ?? [];
  const savedMapping = useSavedImportMapping(accountId);
  const mappingForAccount = mappingDirty ? undefined : (savedMapping.data?.mapping ?? undefined);
  const effectiveMapping = mappingDirty ? mapping : mappingForAccount;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (file === undefined || accountId === "" || effectiveMapping === undefined) {
      setError(mappingError ?? "Choose a file, account, and complete the column mapping.");
      return;
    }
    setError(undefined);
    try {
      const batch = await upload.mutateAsync({ file, accountId, mapping: effectiveMapping });
      router.push(`/imports/${batch.id}`);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not upload this statement."
      );
    }
  }
  if (accounts.isLoading) return <p className="text-sm text-foreground-muted">Loading accounts…</p>;
  if (accountItems.length === 0)
    return (
      <EmptyState
        title="Create an account first"
        description="Imports must be assigned to an account before they can be reviewed."
      />
    );
  return (
    <form
      className="space-y-6 rounded-2xl border border-border bg-surface-elevated p-5 sm:p-7"
      onSubmit={submit}
    >
      <FileDropZone
        accept=".csv"
        onFileSelected={setFile}
        {...(file === undefined ? {} : { selectedFileName: file.name })}
      />
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
        Import to account
        <select
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value);
            setMappingDirty(false);
            setMapping(undefined);
            setMappingError(undefined);
          }}
        >
          <option value="">Select an account</option>
          {accountItems.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      {savedMapping.isLoading && accountId !== "" ? (
        <p aria-live="polite" className="text-sm text-foreground-muted">
          Checking saved mapping…
        </p>
      ) : null}
      {mappingForAccount === undefined ? null : (
        <div
          className="flex flex-wrap items-center gap-3 text-sm text-foreground-muted"
          aria-live="polite"
        >
          <span>Using your last mapping for this account.</span>
        </div>
      )}
      {!mappingDirty ||
      savedMapping.data?.mapping === null ||
      savedMapping.data === undefined ? null : (
        <div
          className="flex flex-wrap items-center gap-3 text-sm text-foreground-muted"
          aria-live="polite"
        >
          <span>Your edits are preserved. A saved mapping is also available.</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setMappingDirty(false);
              setMapping(undefined);
              setMappingError(undefined);
            }}
          >
            Use saved mapping
          </Button>
        </div>
      )}
      {savedMapping.isError ? (
        <p aria-live="polite" className="text-sm text-foreground-muted">
          Could not load a saved mapping. You can enter one manually.
        </p>
      ) : null}
      <MappingForm
        key={`${accountId}-${mappingForAccount === undefined ? "manual" : "saved"}`}
        {...(mappingForAccount === undefined ? {} : { initialMapping: mappingForAccount })}
        onChange={(nextMapping, nextError) => {
          setMappingDirty(true);
          setMapping(nextMapping);
          setMappingError(nextError);
        }}
      />
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <Button type="submit" disabled={upload.isPending}>
        {upload.isPending ? "Uploading…" : "Upload and review"}
      </Button>
    </form>
  );
}

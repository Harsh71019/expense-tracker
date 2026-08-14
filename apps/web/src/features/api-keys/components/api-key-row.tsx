"use client";

import { UpdateApiKeySchema, type ApiKey, type UpdateApiKey } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  permissionsToScopeIds,
  scopeIdsToPermissions,
  scopeLabels,
  SCOPE_OPTIONS
} from "../model/scopes";
import { MaskedValue } from "./masked-value";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type ApiKeyRowProps = Readonly<{
  apiKey: ApiKey;
  onRevoke: (apiKey: ApiKey) => void;
  onUpdate: (keyId: string, input: UpdateApiKey) => void;
  isUpdating: boolean;
}>;

export function ApiKeyRow({ apiKey, onRevoke, onUpdate, isUpdating }: ApiKeyRowProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(apiKey.name);
  const [scopeIds, setScopeIds] = useState(() => permissionsToScopeIds(apiKey.permissions));
  const [error, setError] = useState<string>();

  function resetDraft(): void {
    setName(apiKey.name);
    setScopeIds(permissionsToScopeIds(apiKey.permissions));
    setError(undefined);
  }

  function toggleScope(id: string): void {
    setScopeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function save(): void {
    const parsed = UpdateApiKeySchema.safeParse({
      name,
      permissions: scopeIdsToPermissions(scopeIds)
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Select at least one scope.");
      return;
    }
    setError(undefined);
    onUpdate(apiKey.id, parsed.data);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3.5 rounded-[13px] border border-border bg-surface-elevated px-4.5 py-3.5">
        <Input
          id={`api-key-name-${apiKey.id}`}
          name="name"
          autoComplete="off"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Scopes
          </legend>
          {SCOPE_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex min-h-11 items-center gap-2.5 text-sm text-foreground"
            >
              <input
                type="checkbox"
                className="h-5 w-5 accent-accent"
                checked={scopeIds.has(option.id)}
                onChange={() => toggleScope(option.id)}
                aria-label={option.label}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            variant="secondary"
            onClick={() => {
              resetDraft();
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={save} disabled={isUpdating}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-4 rounded-[13px] border border-border bg-surface-elevated px-4.5 py-3.5 animate-fade-in sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="font-mono text-[15px] text-foreground">{apiKey.name}</span>
        {apiKey.start === null ? null : (
          <MaskedValue value={apiKey.start} ariaLabel={`key prefix for ${apiKey.name}`} />
        )}
        {scopeLabels(apiKey.permissions).map((label) => (
          <span
            key={label}
            className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
          >
            {label}
          </span>
        ))}
        {apiKey.enabled ? null : (
          <span className="rounded-full border border-expense/40 bg-expense/10 px-2.5 py-1 text-xs font-semibold text-expense">
            Revoked
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:shrink-0 sm:justify-start sm:gap-3.5">
        <span className="font-mono text-xs whitespace-nowrap text-foreground-muted">
          Added {dateFormatter.format(apiKey.createdAt)}
        </span>
        {apiKey.enabled ? (
          <>
            <button
              type="button"
              onClick={() => {
                resetDraft();
                setEditing(true);
              }}
              className="min-h-11 rounded-md px-3 py-1 text-sm font-medium text-foreground-muted transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRevoke(apiKey)}
              className="min-h-11 rounded-md px-3 py-1 text-sm font-medium text-expense transition-colors duration-150 hover:bg-expense/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
            >
              Revoke
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

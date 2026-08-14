"use client";

import { CreateApiKeySchema, type CreateApiKey } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";

import { scopeIdsToPermissions, SCOPE_OPTIONS } from "../model/scopes";

export function CreateApiKeyForm({
  isPending,
  onSubmit
}: Readonly<{ isPending: boolean; onSubmit: (input: CreateApiKey) => void }>): ReactNode {
  const [name, setName] = useState("");
  const [scopeIds, setScopeIds] = useState<ReadonlySet<string>>(new Set());
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string>();

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

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = CreateApiKeySchema.safeParse({
      name,
      permissions: scopeIdsToPermissions(scopeIds),
      ...(expiresAt === "" ? {} : { expiresAt: new Date(expiresAt) })
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Select at least one scope.");
      return;
    }
    setError(undefined);
    onSubmit(parsed.data);
    setName("");
    setScopeIds(new Set());
    setExpiresAt("");
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-surface-elevated p-5 sm:p-6"
      onSubmit={submit}
    >
      <Input
        id="create-api-key-name"
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
      <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
        <span>Expires (optional)</span>
        <DatePicker
          id="create-api-key-expiry"
          name="expiresAt"
          aria-label="Expires (optional)"
          placeholder="Expires (optional)"
          clearable
          value={expiresAt}
          onChange={setExpiresAt}
        />
      </div>
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending ? "Creating…" : "Create key"}
      </Button>
    </form>
  );
}

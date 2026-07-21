"use client";

import type { ApiKey, CreateApiKey, UpdateApiKey } from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/ui/empty-state";

import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useUpdateApiKey
} from "../hooks/use-api-keys";
import { ApiKeyReveal } from "./api-key-reveal";
import { ApiKeyRow } from "./api-key-row";
import { CreateApiKeyForm } from "./create-api-key-form";

export function ApiKeyManager({
  initialApiKeys
}: Readonly<{ initialApiKeys: ApiKey[] }>): ReactNode {
  const apiKeys = useApiKeys(initialApiKeys);
  const createKey = useCreateApiKey();
  const updateKey = useUpdateApiKey();
  const revokeKey = useRevokeApiKey();
  const [revealedKey, setRevealedKey] = useState<string>();

  const items = apiKeys.data ?? initialApiKeys;

  async function create(input: CreateApiKey): Promise<void> {
    try {
      const result = await createKey.mutateAsync(input);
      setRevealedKey(result.key);
    } catch {
      toast.error("Could not create this key");
    }
  }

  async function update(keyId: string, input: UpdateApiKey): Promise<void> {
    try {
      await updateKey.mutateAsync({ keyId, input });
    } catch {
      toast.error("Could not update this key");
    }
  }

  async function revoke(apiKey: ApiKey): Promise<void> {
    try {
      await revokeKey.mutateAsync(apiKey.id);
    } catch {
      toast.error("Could not revoke this key");
    }
  }

  return (
    <section className="mx-auto max-w-[940px] space-y-6">
      <header>
        <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">
          LEDGER · AUTOMATION
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          API keys
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
          Scoped, revocable credentials for external automation — e.g. n8n creating transactions
          from parsed bank emails. Each key only reaches the routes its scopes explicitly allow.
        </p>
      </header>

      {revealedKey === undefined ? null : (
        <ApiKeyReveal apiKey={revealedKey} onDismiss={() => setRevealedKey(undefined)} />
      )}

      <CreateApiKeyForm isPending={createKey.isPending} onSubmit={(input) => void create(input)} />

      {items.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          description="Create one above to let an external app call the API on your behalf."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((apiKey) => (
            <ApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              isUpdating={updateKey.isPending}
              onUpdate={(keyId, input) => void update(keyId, input)}
              onRevoke={(target) => void revoke(target)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import type { ApiKey, CreateApiKey, UpdateApiKey } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
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

const TABS = [
  { id: "keys", label: "All keys" },
  { id: "add", label: "Add key" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ApiKeyManager({
  initialApiKeys
}: Readonly<{ initialApiKeys: ApiKey[] }>): ReactNode {
  const apiKeys = useApiKeys(initialApiKeys);
  const createKey = useCreateApiKey();
  const updateKey = useUpdateApiKey();
  const revokeKey = useRevokeApiKey();
  const [revealedKey, setRevealedKey] = useState<string>();
  const [activeTab, setActiveTab] = useState<TabId>("keys");

  const items = apiKeys.data ?? initialApiKeys;

  async function create(input: CreateApiKey): Promise<void> {
    try {
      const result = await createKey.mutateAsync(input);
      setRevealedKey(result.key);
      toast.success("API key created");
    } catch {
      toast.error("Could not create this key");
    }
  }

  async function update(keyId: string, input: UpdateApiKey): Promise<void> {
    try {
      await updateKey.mutateAsync({ keyId, input });
      toast.success("API key updated");
    } catch {
      toast.error("Could not update this key");
    }
  }

  async function revoke(apiKey: ApiKey): Promise<void> {
    try {
      await revokeKey.mutateAsync(apiKey.id);
      toast.success("API key revoked");
    } catch {
      toast.error("Could not revoke this key");
    }
  }

  return (
    <section className="mx-auto max-w-[940px] space-y-6">
      <Breadcrumbs
        items={[{ label: "Settings", href: "/settings?tab=management" }, { label: "API keys" }]}
      />

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

      <div
        role="tablist"
        aria-label="API keys sections"
        className="flex w-full gap-1 rounded-xl border border-border bg-surface-elevated p-1 sm:inline-flex sm:w-auto"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`api-keys-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`api-keys-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:flex-none ${
                active
                  ? "bg-accent text-accent-foreground shadow-glow"
                  : "text-foreground-muted hover:bg-accent-glow hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "keys" ? (
        <div
          id="api-keys-panel-keys"
          role="tabpanel"
          aria-labelledby="api-keys-tab-keys"
          tabIndex={0}
        >
          {items.length === 0 ? (
            <EmptyState
              title="No API keys yet"
              description="Switch to the Add key tab to create one."
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
        </div>
      ) : (
        <div
          id="api-keys-panel-add"
          role="tabpanel"
          aria-labelledby="api-keys-tab-add"
          tabIndex={0}
          className="flex flex-col gap-6"
        >
          {revealedKey === undefined ? null : (
            <ApiKeyReveal apiKey={revealedKey} onDismiss={() => setRevealedKey(undefined)} />
          )}

          <CreateApiKeyForm
            isPending={createKey.isPending}
            onSubmit={(input) => void create(input)}
          />
        </div>
      )}
    </section>
  );
}

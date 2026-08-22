"use client";

import type { ApiKey, CreateApiKey, UpdateApiKey } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

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
  const [searchQuery, setSearchQuery] = useState("");

  const rawItems = apiKeys.data ?? initialApiKeys;
  let items = rawItems;
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    items = items.filter((key) => key.name.toLowerCase().includes(q));
  }

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
    <section className="space-y-6">
      <header>
        <p className="font-mono text-2xs font-bold tracking-[2px] text-accent">
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
        className={`mb-5 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
          searchQuery.trim() !== ""
            ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
            : "border-border/80 bg-surface-elevated/90"
        }`}
      >
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20 sm:min-w-56 sm:basis-auto">
          <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
            ⌕
          </span>
          <input
            value={searchQuery}
            name="apiKeySearch"
            autoComplete="off"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search API keys by name…"
            aria-label="Search API keys"
            className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
          />
          {searchQuery !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search input"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ✕
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="API keys sections"
          className="flex gap-1 rounded-xl border border-border bg-surface-muted p-1"
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
                className={`min-h-9 rounded-lg px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "bg-surface-elevated text-foreground shadow-xs"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
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

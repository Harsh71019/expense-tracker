# API Key Auth — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A settings page where the user can generate, view, edit the scopes of, and revoke API keys for external automation (n8n) — matching the app's existing settings-page design language exactly.

**Architecture:** One new feature slice (`apps/web/src/features/api-keys/`) following this codebase's established `server/hooks/components/model/index.ts` split, composed into a new route at `/settings/api-keys`, linked from the existing settings hub. Consumes the typed OpenAPI client generated in the backend plan's Task 10 (`pnpm gen:client`) — this plan cannot start until that's merged.

**Tech Stack:** Next.js App Router, TanStack Query, zod (`@vyaya/shared`), `openapi-fetch`, Vitest + Testing Library.

## Global Constraints

- New UI must match existing design language exactly — same `rounded-2xl`/`rounded-xl` `border-border bg-surface-elevated` card patterns, `font-mono` uppercase accent-colored labels, existing `Button`/`Input`/`EmptyState` components — check a sibling feature (`category-rules`) before writing any new class name (explicit user instruction, not just convention-following).
- `pnpm --filter @vyaya/web test:coverage` thresholds are 90% stmts/branches/funcs/lines — every new component needs a real test, not just the mutation hooks.
- Mutation hooks that create resources normally require an `Idempotency-Key` header (AGENTS.md §6) — the one exception is `POST /v1/api-keys`, which the backend plan deliberately does not support with idempotency (the raw key can't safely be replayed from a persisted idempotency record). `PATCH`/`DELETE` on `/v1/api-keys/:id` don't need it either — the backend controller doesn't parse an `Idempotency-Key` header for this resource at all (revoking/renaming is naturally idempotent), so don't add one on the frontend side either.
- Never hand-write a `fetch` to the backend — always the generated `apiClient` (`src/lib/api/client.ts`) for client components, `getServerApiClient()` (`src/lib/api/server.ts`) for server components.
- `pnpm --filter @vyaya/web lint` must pass with `--max-warnings=0`.

## Prerequisite

This plan assumes `docs/plans/2026-07-19-api-key-auth-backend.md` is complete and `pnpm gen:client` has been run against it, so `apiClient.POST("/v1/api-keys", ...)` etc. are valid, typed calls and `ApiKey`/`CreateApiKey`/`UpdateApiKey`/`CreateApiKeyResponse` are exported from `@vyaya/shared`.

---

## Task 1: Query key, pure scope-mapping model, and TanStack Query hooks

**Files:**
- Modify: `apps/web/src/lib/query/keys.ts`
- Create: `apps/web/src/features/api-keys/model/scopes.ts`
- Create: `apps/web/src/features/api-keys/model/scopes.test.ts`
- Create: `apps/web/src/features/api-keys/hooks/use-api-keys.ts`
- Create: `apps/web/src/features/api-keys/hooks/use-api-keys.test.ts`

**Interfaces:**
- Produces: `qk.apiKeys()` — used by every hook below and by `server/get-api-keys.ts` (Task 2) implicitly (same resource, though the server fetcher doesn't use TanStack Query keys directly).
- Produces: `SCOPE_OPTIONS`, `scopeIdsToPermissions(ids)`, `permissionsToScopeIds(permissions)`, `scopeLabels(permissions)` — consumed by every component in Task 4.
- Produces: `useApiKeys(initialData)`, `useCreateApiKey()`, `useUpdateApiKey()`, `useRevokeApiKey()` — consumed by `api-key-manager.tsx` (Task 4).

- [ ] **Step 1: Add the query key**

Edit `apps/web/src/lib/query/keys.ts`. Add one entry to the `qk` object, alongside `categoryRules`:

```typescript
  apiKeys: () => ["api-keys"] as const,
```

- [ ] **Step 2: Write the failing test for the scope model**

Create `apps/web/src/features/api-keys/model/scopes.test.ts`:

```typescript
import type { ApiKeyPermissions } from "@vyaya/shared";
import { describe, expect, it } from "vitest";

import { permissionsToScopeIds, scopeIdsToPermissions, scopeLabels } from "./scopes";

describe("scopeIdsToPermissions", () => {
  it("builds a permissions object from selected scope ids", () => {
    const permissions = scopeIdsToPermissions(new Set(["transactions-write", "accounts-read"]));
    expect(permissions).toEqual({ transactions: ["write"], accounts: ["read"] });
  });

  it("returns an empty object for no selection", () => {
    expect(scopeIdsToPermissions(new Set())).toEqual({});
  });
});

describe("permissionsToScopeIds", () => {
  it("round-trips through scopeIdsToPermissions", () => {
    const ids = new Set(["categories-read"]);
    expect(permissionsToScopeIds(scopeIdsToPermissions(ids))).toEqual(ids);
  });

  it("returns an empty set for null permissions", () => {
    expect(permissionsToScopeIds(null)).toEqual(new Set());
  });
});

describe("scopeLabels", () => {
  it("returns human-readable labels for the selected scopes", () => {
    const permissions: ApiKeyPermissions = { transactions: ["write"], categories: ["read"] };
    expect(scopeLabels(permissions)).toEqual(["Create transactions", "Read categories"]);
  });

  it("returns an empty array for null permissions", () => {
    expect(scopeLabels(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/model/scopes.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the scope model**

Create `apps/web/src/features/api-keys/model/scopes.ts`:

```typescript
import type { ApiKeyPermissions } from "@vyaya/shared";

export const SCOPE_OPTIONS = [
  {
    id: "transactions-write",
    label: "Create transactions",
    resource: "transactions",
    action: "write"
  },
  { id: "categories-read", label: "Read categories", resource: "categories", action: "read" },
  { id: "accounts-read", label: "Read accounts", resource: "accounts", action: "read" }
] as const;

export function scopeIdsToPermissions(ids: ReadonlySet<string>): ApiKeyPermissions {
  const permissions: Record<string, string[]> = {};
  for (const option of SCOPE_OPTIONS) {
    if (ids.has(option.id)) {
      permissions[option.resource] = [option.action];
    }
  }
  return permissions;
}

export function permissionsToScopeIds(permissions: ApiKeyPermissions | null): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const option of SCOPE_OPTIONS) {
    const actions: readonly string[] | undefined =
      permissions?.[option.resource as keyof ApiKeyPermissions];
    if (actions?.includes(option.action) === true) {
      ids.add(option.id);
    }
  }
  return ids;
}

export function scopeLabels(permissions: ApiKeyPermissions | null): string[] {
  return SCOPE_OPTIONS.filter(
    (option) =>
      permissions?.[option.resource as keyof ApiKeyPermissions]?.includes(option.action) === true
  ).map((option) => option.label);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/model/scopes.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the hooks**

Create `apps/web/src/features/api-keys/hooks/use-api-keys.test.ts`:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ApiKey } from "@vyaya/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";

import { useCreateApiKey, useRevokeApiKey, useUpdateApiKey } from "./use-api-keys";

vi.mock("@/lib/api/client", () => ({
  apiClient: { POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }
}));

const sampleKey: ApiKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: null,
  lastRequest: null
};

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useCreateApiKey", () => {
  it("posts the create body and returns the parsed response", async () => {
    vi.mocked(apiClient.POST).mockResolvedValue({
      data: { ...sampleKey, key: "ak_secret" },
      error: undefined,
      response: { status: 201 }
    } as never);

    const { result } = renderHook(() => useCreateApiKey(), { wrapper: wrapper() });
    result.current.mutate({ name: "n8n", permissions: { transactions: ["write"] } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "key-1", key: "ak_secret" });
    expect(apiClient.POST).toHaveBeenCalledWith("/v1/api-keys", {
      body: { name: "n8n", permissions: { transactions: ["write"] } }
    });
  });
});

describe("useUpdateApiKey", () => {
  it("patches by keyId and returns the parsed key", async () => {
    vi.mocked(apiClient.PATCH).mockResolvedValue({
      data: { ...sampleKey, name: "renamed" },
      error: undefined,
      response: { status: 200 }
    } as never);

    const { result } = renderHook(() => useUpdateApiKey(), { wrapper: wrapper() });
    result.current.mutate({ keyId: "key-1", input: { name: "renamed" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("renamed");
    expect(apiClient.PATCH).toHaveBeenCalledWith("/v1/api-keys/{keyId}", {
      params: { path: { keyId: "key-1" } },
      body: { name: "renamed" }
    });
  });
});

describe("useRevokeApiKey", () => {
  it("deletes by keyId", async () => {
    vi.mocked(apiClient.DELETE).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: { status: 204 }
    } as never);

    const { result } = renderHook(() => useRevokeApiKey(), { wrapper: wrapper() });
    result.current.mutate("key-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.DELETE).toHaveBeenCalledWith("/v1/api-keys/{keyId}", {
      params: { path: { keyId: "key-1" } }
    });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/hooks/use-api-keys.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 6: Create the hooks**

Create `apps/web/src/features/api-keys/hooks/use-api-keys.ts`:

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiKeySchema,
  CreateApiKeyResponseSchema,
  type ApiKey,
  type CreateApiKey,
  type CreateApiKeyResponse,
  type UpdateApiKey
} from "@vyaya/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const ApiKeysSchema = z.array(ApiKeySchema);

export function useApiKeys(initialData: ApiKey[]): ReturnType<typeof useQuery<ApiKey[], Error>> {
  return useQuery({
    queryKey: qk.apiKeys(),
    initialData,
    queryFn: async (): Promise<ApiKey[]> => {
      const result = await apiClient.GET("/v1/api-keys");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ApiKeysSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}

export function useCreateApiKey(): ReturnType<
  typeof useMutation<CreateApiKeyResponse, Error, CreateApiKey>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body): Promise<CreateApiKeyResponse> => {
      try {
        const result = await apiClient.POST("/v1/api-keys", { body });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CreateApiKeyResponseSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.apiKeys() });
    }
  });
}

export function useUpdateApiKey(): ReturnType<
  typeof useMutation<ApiKey, Error, { keyId: string; input: UpdateApiKey }>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId, input }): Promise<ApiKey> => {
      try {
        const result = await apiClient.PATCH("/v1/api-keys/{keyId}", {
          params: { path: { keyId } },
          body: input
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ApiKeySchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.apiKeys() });
    }
  });
}

export function useRevokeApiKey(): ReturnType<typeof useMutation<void, Error, string>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (keyId): Promise<void> => {
      try {
        const result = await apiClient.DELETE("/v1/api-keys/{keyId}", {
          params: { path: { keyId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.apiKeys() });
    }
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/hooks/use-api-keys.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/web typecheck && pnpm --filter @vyaya/web lint`
Expected: clean.

```bash
git add apps/web/src/lib/query/keys.ts apps/web/src/features/api-keys/model/scopes.ts apps/web/src/features/api-keys/model/scopes.test.ts apps/web/src/features/api-keys/hooks/use-api-keys.ts apps/web/src/features/api-keys/hooks/use-api-keys.test.ts
git commit -m "feat(api-keys): add query key, scope model, and TanStack Query hooks"
```

---

## Task 2: Server-side fetcher for SSR

**Files:**
- Create: `apps/web/src/features/api-keys/server/get-api-keys.ts`

**Interfaces:**
- Produces: `getApiKeys(): Promise<ApiKey[]>` — consumed by `app/(app)/settings/api-keys/page.tsx` (Task 5) to hydrate `useApiKeys`'s `initialData`.

- [ ] **Step 1: Create the fetcher**

This mirrors `apps/web/src/features/accounts/server/get-accounts.ts` exactly (server-only, wrapped in `cache()`, fails closed to an empty array — no test file, matching that this codebase doesn't unit-test these thin SSR fetchers directly; they're exercised indirectly via `routes.test.tsx`-style page tests where relevant, and this page isn't in that smoke test's sample per Task 5's note).

Create `apps/web/src/features/api-keys/server/get-api-keys.ts`:

```typescript
import { ApiKeySchema, type ApiKey } from "@vyaya/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const ApiKeysSchema = z.array(ApiKeySchema);

export const getApiKeys = cache(async (): Promise<ApiKey[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/api-keys");
    const parsed = ApiKeysSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
```

- [ ] **Step 2: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/web typecheck && pnpm --filter @vyaya/web lint`
Expected: clean.

```bash
git add apps/web/src/features/api-keys/server/get-api-keys.ts
git commit -m "feat(api-keys): add server-side fetcher for SSR"
```

---

## Task 3: `ApiKeyReveal` component (the once-only key display)

**Files:**
- Create: `apps/web/src/features/api-keys/components/api-key-reveal.tsx`
- Create: `apps/web/src/features/api-keys/components/api-key-reveal.test.tsx`

**Interfaces:**
- Produces: `<ApiKeyReveal apiKey={string} onDismiss={() => void}>` — consumed by `api-key-manager.tsx` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/api-keys/components/api-key-reveal.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiKeyReveal } from "./api-key-reveal";

describe("ApiKeyReveal", () => {
  it("shows the raw key, copies it, and dismisses", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ApiKeyReveal apiKey="ak_verysecret123" onDismiss={onDismiss} />);

    expect(screen.getByText("ak_verysecret123")).toBeVisible();
    expect(screen.getByText(/won't be shown again/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("ak_verysecret123");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/api-key-reveal.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the component**

Create `apps/web/src/features/api-keys/components/api-key-reveal.tsx`:

```typescript
"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ApiKeyReveal({
  apiKey,
  onDismiss
}: Readonly<{ apiKey: string; onDismiss: () => void }>): ReactNode {
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(apiKey);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-accent-glow/20 p-4.5 sm:p-5">
      <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-accent uppercase">
        New API key
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Copy this now — it won&apos;t be shown again.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{apiKey}</code>
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          Copy
        </Button>
      </div>
      <div className="mt-3.5 flex justify-end">
        <Button type="button" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/api-key-reveal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/web typecheck && pnpm --filter @vyaya/web lint`
Expected: clean.

```bash
git add apps/web/src/features/api-keys/components/api-key-reveal.tsx apps/web/src/features/api-keys/components/api-key-reveal.test.tsx
git commit -m "feat(api-keys): add ApiKeyReveal component for the once-only key display"
```

---

## Task 4: `ApiKeyRow`, `CreateApiKeyForm`, and `ApiKeyManager`

**Files:**
- Create: `apps/web/src/features/api-keys/components/api-key-row.tsx`
- Create: `apps/web/src/features/api-keys/components/api-key-row.test.tsx`
- Create: `apps/web/src/features/api-keys/components/create-api-key-form.tsx`
- Create: `apps/web/src/features/api-keys/components/create-api-key-form.test.tsx`
- Create: `apps/web/src/features/api-keys/components/api-key-manager.tsx`
- Create: `apps/web/src/features/api-keys/components/api-key-manager.test.tsx`

**Interfaces:**
- Consumes: `useApiKeys`/`useCreateApiKey`/`useUpdateApiKey`/`useRevokeApiKey` (Task 1), `SCOPE_OPTIONS`/`scopeIdsToPermissions`/`permissionsToScopeIds`/`scopeLabels` (Task 1), `ApiKeyReveal` (Task 3).
- Produces: `<ApiKeyManager initialApiKeys={ApiKey[]}>` — consumed by `app/(app)/settings/api-keys/page.tsx` (Task 5).

- [ ] **Step 1: Write the failing test for `ApiKeyRow`**

Create `apps/web/src/features/api-keys/components/api-key-row.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiKey } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiKeyRow } from "./api-key-row";

const key: ApiKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date("2026-05-02T12:10:00.000Z"),
  expiresAt: null,
  lastRequest: null
};

describe("ApiKeyRow", () => {
  it("shows the name and scope labels, and requests revocation without confirmation", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    render(<ApiKeyRow apiKey={key} onRevoke={onRevoke} onUpdate={vi.fn()} isUpdating={false} />);

    expect(screen.getByText("n8n")).toBeVisible();
    expect(screen.getByText("Create transactions")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).toHaveBeenCalledWith(key);
  });

  it("toggles into edit mode and submits an updated name and scopes", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <ApiKeyRow apiKey={key} onRevoke={vi.fn()} onUpdate={onUpdate} isUpdating={false} />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "n8n renamed");
    await user.click(screen.getByLabelText("Read accounts"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith(key.id, {
      name: "n8n renamed",
      permissions: { transactions: ["write"], accounts: ["read"] }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/api-key-row.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `ApiKeyRow`**

Create `apps/web/src/features/api-keys/components/api-key-row.tsx`:

```typescript
"use client";

import type { ApiKey, UpdateApiKey } from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { permissionsToScopeIds, scopeIdsToPermissions, scopeLabels, SCOPE_OPTIONS } from "../model/scopes";

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
    onUpdate(apiKey.id, { name, permissions: scopeIdsToPermissions(scopeIds) });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3.5 rounded-[13px] border border-border bg-surface-elevated px-4.5 py-3.5">
        <Input id={`api-key-name-${apiKey.id}`} label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <fieldset className="flex flex-col gap-2">
          <legend className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Scopes
          </legend>
          {SCOPE_OPTIONS.map((option) => (
            <label key={option.id} className="flex items-center gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={scopeIds.has(option.id)}
                onChange={() => toggleScope(option.id)}
                aria-label={option.label}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isUpdating}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[13px] border border-border bg-surface-elevated px-4.5 py-3.5 animate-fade-in">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <span className="font-mono text-[15px] text-foreground">{apiKey.name}</span>
        {scopeLabels(apiKey.permissions).map((label) => (
          <span
            key={label}
            className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[12px] font-semibold text-foreground-muted"
          >
            {label}
          </span>
        ))}
        {apiKey.enabled ? null : (
          <span className="rounded-full border border-expense/40 bg-expense/10 px-2.5 py-1 text-[12px] font-semibold text-expense">
            Revoked
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3.5">
        <span className="font-mono text-xs whitespace-nowrap text-foreground-muted">
          Added {dateFormatter.format(apiKey.createdAt)}
        </span>
        {apiKey.enabled ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-1.5 py-1 text-sm font-medium text-foreground-muted transition-colors duration-150 hover:bg-surface-muted"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onRevoke(apiKey)}
              className="rounded-md px-1.5 py-1 text-sm font-medium text-expense transition-colors duration-150 hover:bg-expense/10"
            >
              Revoke
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/api-key-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `CreateApiKeyForm`**

Create `apps/web/src/features/api-keys/components/create-api-key-form.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateApiKeyForm } from "./create-api-key-form";

describe("CreateApiKeyForm", () => {
  it("submits the name and selected scopes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateApiKeyForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByLabelText("Read categories"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "n8n",
      permissions: { transactions: ["write"], categories: ["read"] }
    });
  });

  it("shows a validation message and does not submit when no scope is selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateApiKeyForm isPending={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/select at least one scope/i)).toBeVisible();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/create-api-key-form.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Create `CreateApiKeyForm`**

Create `apps/web/src/features/api-keys/components/create-api-key-form.tsx`:

```typescript
"use client";

import { CreateApiKeySchema, type CreateApiKey } from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
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
      <Input id="create-api-key-name" label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          Scopes
        </legend>
        {SCOPE_OPTIONS.map((option) => (
          <label key={option.id} className="flex items-center gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={scopeIds.has(option.id)}
              onChange={() => toggleScope(option.id)}
              aria-label={option.label}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <Input
        id="create-api-key-expiry"
        label="Expires (optional)"
        type="date"
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.target.value)}
      />
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create key"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/create-api-key-form.test.tsx`
Expected: PASS.

- [ ] **Step 9: Write the failing test for `ApiKeyManager`**

Create `apps/web/src/features/api-keys/components/api-key-manager.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiKey } from "@vyaya/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiKeyManager } from "./api-key-manager";

const mocks = vi.hoisted(() => ({
  apiKeys: [] as ApiKey[],
  createMutateAsync: vi.fn(),
  createPending: false,
  updateMutateAsync: vi.fn(),
  updatePending: false,
  revokeMutateAsync: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("../hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: mocks.apiKeys }),
  useCreateApiKey: () => ({ mutateAsync: mocks.createMutateAsync, isPending: mocks.createPending }),
  useUpdateApiKey: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: mocks.updatePending }),
  useRevokeApiKey: () => ({ mutateAsync: mocks.revokeMutateAsync })
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

const key: ApiKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date("2026-05-02T12:10:00.000Z"),
  expiresAt: null,
  lastRequest: null
};

describe("ApiKeyManager", () => {
  beforeEach(() => {
    mocks.apiKeys = [];
    mocks.createPending = false;
    mocks.updatePending = false;
    mocks.createMutateAsync.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.revokeMutateAsync.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows the zero state when there are no keys", () => {
    render(<ApiKeyManager initialApiKeys={[]} />);
    expect(screen.getByText("No API keys yet")).toBeVisible();
  });

  it("reveals the raw key once after a successful create, then hides it on dismiss", async () => {
    const user = userEvent.setup();
    mocks.createMutateAsync.mockResolvedValue({ ...key, key: "ak_secret123" });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ApiKeyManager initialApiKeys={[]} />);

    await user.type(screen.getByLabelText("Name"), "n8n");
    await user.click(screen.getByLabelText("Create transactions"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText("ak_secret123")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("ak_secret123")).not.toBeInTheDocument();
  });

  it("revokes a key without confirmation", async () => {
    const user = userEvent.setup();
    mocks.apiKeys = [key];
    mocks.revokeMutateAsync.mockResolvedValue(undefined);
    render(<ApiKeyManager initialApiKeys={mocks.apiKeys} />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(mocks.revokeMutateAsync).toHaveBeenCalledWith("key-1");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/api-key-manager.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 11: Create `ApiKeyManager`**

Create `apps/web/src/features/api-keys/components/api-key-manager.tsx`:

```typescript
"use client";

import type { ApiKey, CreateApiKey, UpdateApiKey } from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/ui/empty-state";

import { useApiKeys, useCreateApiKey, useRevokeApiKey, useUpdateApiKey } from "../hooks/use-api-keys";
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
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @vyaya/web test -- src/features/api-keys/components/api-key-manager.test.tsx`
Expected: PASS.

- [ ] **Step 13: Typecheck, lint, coverage, commit**

Run: `pnpm --filter @vyaya/web typecheck && pnpm --filter @vyaya/web lint && pnpm --filter @vyaya/web test:coverage -- src/features/api-keys`
Expected: clean, coverage at/above the 90% thresholds for the new files. If below, the gap is almost certainly the `ApiKeyRow` edit-mode branch or the `CreateApiKeyForm` validation-error branch — both already have a test above; if coverage still complains, check which specific line/branch is flagged and add the missing case rather than lowering the threshold.

```bash
git add apps/web/src/features/api-keys/components/
git commit -m "feat(api-keys): add ApiKeyRow, CreateApiKeyForm, and ApiKeyManager"
```

---

## Task 5: Route, settings-hub link, and Sentry scrub entry

**Files:**
- Create: `apps/web/src/features/api-keys/index.ts`
- Create: `apps/web/src/app/(app)/settings/api-keys/page.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`
- Modify: `apps/web/src/lib/sentry-scrub.ts`
- Modify: `apps/web/src/lib/sentry-scrub.test.ts` (check the existing file first for its exact structure/mock shape before adding to it)

**Interfaces:**
- Consumes: `ApiKeyManager` (Task 4), `getApiKeys` (Task 2).

- [ ] **Step 1: Create the feature's public barrel**

Create `apps/web/src/features/api-keys/index.ts`:

```typescript
export { ApiKeyManager } from "./components/api-key-manager";
export { getApiKeys } from "./server/get-api-keys";
```

- [ ] **Step 2: Create the route**

Create `apps/web/src/app/(app)/settings/api-keys/page.tsx`:

```typescript
import type { ReactNode } from "react";

import { ApiKeyManager, getApiKeys } from "@/features/api-keys";

export default async function ApiKeysPage(): Promise<ReactNode> {
  return <ApiKeyManager initialApiKeys={await getApiKeys()} />;
}
```

- [ ] **Step 3: Link it from the settings hub**

Edit `apps/web/src/app/(app)/settings/page.tsx`. Add one entry to the `settingsLinks` array, after the `"/imports"` entry and before `"/export"` (or anywhere in the list — order is cosmetic, this placement keeps automation-adjacent entries near each other):

```typescript
  { href: "/settings/api-keys", label: "API keys", description: "Tokens for external apps", icon: "⚿" },
```

- [ ] **Step 4: Read the existing sentry-scrub test file's structure**

Read `apps/web/src/lib/sentry-scrub.test.ts` in full before editing it — match its exact `Breadcrumb`/`ErrorEvent` mock shape rather than inventing a new one.

- [ ] **Step 5: Add a failing test for the new sensitive key**

Add a test to `apps/web/src/lib/sentry-scrub.test.ts` (following whatever pattern the existing tests in that file use for asserting a field gets redacted — mirror the existing `password`/`amountMinor` test case exactly, just with `key` as the field name and a string value, expecting it to become `"⟨text⟩"`).

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @vyaya/web test -- src/lib/sentry-scrub.test.ts`
Expected: FAIL — `key` isn't redacted yet.

- [ ] **Step 6: Add `key` to `SENSITIVE_KEYS`**

Edit `apps/web/src/lib/sentry-scrub.ts`. Change:

```typescript
const SENSITIVE_KEYS = new Set(["amountMinor", "description", "password"]);
```

to:

```typescript
const SENSITIVE_KEYS = new Set(["amountMinor", "description", "password", "key"]);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @vyaya/web test -- src/lib/sentry-scrub.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, full test run, commit**

Run: `pnpm --filter @vyaya/web typecheck && pnpm --filter @vyaya/web lint && pnpm --filter @vyaya/web test`
Expected: clean.

```bash
git add apps/web/src/features/api-keys/index.ts apps/web/src/app/\(app\)/settings/api-keys/page.tsx apps/web/src/app/\(app\)/settings/page.tsx apps/web/src/lib/sentry-scrub.ts apps/web/src/lib/sentry-scrub.test.ts
git commit -m "feat(api-keys): add settings route, hub link, and Sentry key redaction"
```

---

## Task 6: Manual verification in the browser

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Start the stack**

Run: `pnpm dev` (or the `restart-docker-local` skill if working against the Docker stack instead — check which the user is running before choosing).

- [ ] **Step 2: Walk the golden path**

Log in, navigate to `/settings`, click "API keys," create a key with one scope selected, confirm the raw key shows once in a copy box and copying works, refresh the page and confirm the key is listed (without the raw value), edit its name/scopes, revoke it, confirm the row shows a "Revoked" badge and its Edit/Revoke buttons disappear.

- [ ] **Step 3: Confirm the design language matches**

Compare against `/settings/category-rules` side-by-side — card borders, spacing, label typography, button styles should be visually indistinguishable in kind (same tokens), not just similar.

Report back what was tested and any visual mismatch found, rather than declaring done without having looked at it in a browser — per this project's verification norms (`superpowers:verification-before-completion`).

---

## Self-Review Notes

**Spec coverage:** the design's "Web UI" section maps entirely to Tasks 1-5 (feature slice structure, settings link, design-language match, once-only key reveal, no `Idempotency-Key` on create, `SENSITIVE_KEYS` addition). Task 6 covers the "start the dev server and use the feature in a browser" requirement from this project's own CLAUDE.md for UI changes.

**Type consistency:** `ApiKey`/`CreateApiKey`/`UpdateApiKey`/`CreateApiKeyResponse` (from `@vyaya/shared`, produced by the backend plan's Task 6) are the only types used across every hook/component in this plan — no locally-redeclared shapes that could drift from the backend's.

**No placeholders:** every step has literal, complete code. The one step that explicitly defers to reading an existing file first (Task 5 Step 4, the Sentry scrub test) is a "match this file's existing pattern exactly" instruction, not a TBD — the same category of instruction the spec itself demanded ("check sibling pages before styling anything new").

# Phase 2 UI Implementation Guide — Transactions & Quick-Add

> Hand this file to whoever/whatever implements it (this doc was written to be self-contained —
> it does not assume the implementer has read `BACKEND.md`/`FRONTEND.md`/`AGENTS.md`, though it
> quotes the rules from them that matter). Companion docs for deeper context:
> `FRONTEND.md` (target frontend architecture), `AGENTS.md` (non-negotiable repo rules),
> `IMPLEMENTATION-PLAN.md` (Phase 2 = "Ledger Core").

## 0. What this closes out

`IMPLEMENTATION-PLAN.md` Phase 2 is done on the backend (accounts, categories, transactions,
transfers, reversal, PATCH, cursor pagination, net-worth assets — all shipped, tested, RFC 7807
error shape standardized). The **only** remaining Phase 2 item is task **§10: "Next.js:
transaction list + quick-add form (mobile-first — this is the Metro screen; idempotency UUID
generated on mount)."**

**Gate 2 (the thing this UI must make demonstrable):**

> On your phone: add chai ₹20 → balance moves → undo → balance restores → both entries visible
> in history with linkage. Double-tap the submit button on throttled 3G devtools → exactly one
> transaction. Kill the API mid-request in a chaos test → no partial writes.

The backend already guarantees the "no partial writes" and "exactly one transaction" parts
(MongoDB transactions + idempotency keys). This guide is entirely about the client wiring needed
to _demonstrate_ that guarantee: a quick-add form that generates its idempotency key on mount, a
transaction list that shows the linkage between a transaction and its reversal, and an undo
action.

**Out of scope for this guide** (do not build these — they belong to later phases):

- Transfers UI (`POST /v1/transfers`) — backend exists, no UI required for Gate 2.
- Net-worth / assets UI — separate feature, not part of Phase 2's UI task.
- Offline queue / PWA / service worker — that's `FRONTEND.md` §7, mapped to Phase F4 (`IMPLEMENTATION-PLAN.md` Phase 5), not F1.
- Account/category _management_ UI (rename, edit color/icon) — only enough to unblock quick-add (see §7).
- CSV imports, budgets, recurring, reports charts — later phases.

---

## 1. Current state — what already exists, do not rebuild

Checked directly against the repo before writing this guide. Do not recreate any of these:

**App shell & auth (done):**

- `apps/web/src/app/layout.tsx` — root layout, fonts, theme cookie.
- `apps/web/src/app/(auth)/login/page.tsx` + `features/auth/components/login-form.tsx` — working login.
- `apps/web/src/app/(app)/layout.tsx` — authenticated shell: sidebar (≥md) / bottom nav (<md), theme toggle, sign-out. Session-gated (`redirect("/login")` if no session).
- `apps/web/src/components/app-nav.tsx`, `features/auth/components/sign-out-button.tsx`.

**Design tokens & primitives (done, reuse as-is):**

- `apps/web/src/app/globals.css` — Tailwind v4 `@theme` tokens: `--color-surface`, `--color-surface-muted`, `--color-surface-elevated`, `--color-border`, `--color-foreground`, `--color-foreground-muted`, `--color-accent`, `--color-accent-strong`, `--color-accent-foreground`, `--color-income`, `--color-expense`, `--color-reversed`. Light/dark via `prefers-color-scheme` + explicit `:root[data-theme="light|dark"]` override (cookie-backed toggle). **Never hardcode a hex/oklch color in a component — always use these token classes** (`bg-surface`, `text-income`, etc).
- `apps/web/src/components/ui/button.tsx` — `<Button variant="primary"|"secondary">`.
- `apps/web/src/components/ui/input.tsx` — `<Input id label ...props>`.
- `apps/web/src/components/ui/money.tsx` — `<Money minor variant="income"|"expense"|"neutral" signed? />`. **This is the only component allowed to render a currency amount** (see Money Rules below). Do not write `amountMinor / 100` anywhere else.
- `apps/web/src/components/ui/theme-toggle.tsx`, `coming-soon.tsx` (the placeholder you're replacing).

**Stub pages to replace (currently render `<ComingSoon phase="Phase 2" />`):**

- `apps/web/src/app/(app)/transactions/page.tsx`
- `apps/web/src/app/(app)/add/page.tsx`

**Infra already in place, reuse the pattern:**

- `apps/web/src/lib/api/session.ts` — `getSession()`: RSC-side, `cookies()`-forwarded fetch, `React.cache()`-wrapped, zod-validated response, fails closed to `null` on any error. **This exact shape (cache + cookie-forward + zod-parse + fail-closed) is the template for every other RSC data loader you write** — except per §3 below, the fetch itself is going to be replaced by a generated, typed client.
- `apps/web/src/lib/errors.ts` — `AppError` / `AuthError` / `NetworkError` / `ValidationError` / `ConflictError` taxonomy. Branch on error _class_, never on message strings or raw status codes.
- `apps/web/src/lib/request-id.ts` — `generateRequestId()` (`crypto.randomUUID()`), used for `x-request-id` header on every outgoing fetch (already load-bearing for tracing — keep doing it).
- `apps/web/src/lib/debug.ts` — namespaced debug logger (`debug.api`, `debug.query`, `debug.form`, `debug.offline`), gated on `NODE_ENV !== production` or a `localStorage` flag. Use `debug.query` / `debug.form` in the new code, matching the existing `debug.api` usage in `session.ts`.
- `apps/web/src/lib/theme*.ts` — cookie-backed theme, unrelated to this work, don't touch.
- `apps/web/src/features/transactions/model/filters.ts` — `parseTransactionFilters(searchParams)` / `serializeTransactionFilters(filters)`, already converts URL search params ↔ `ListTransactionsQuery` (zod-validated, fails closed to the default `{ limit: 50 }` on garbage input). **Use this as-is** for the transaction list's URL-driven filter state — do not reimplement it.

**Not installed yet (you will add these — see §3):** `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `openapi-typescript`, `openapi-fetch`, `@asteasolutions/zod-to-openapi`.

---

## 2. Non-negotiable rules (from `AGENTS.md` — violating these is a failed task)

1. **Money is always integer paise** (`amountMinor`, positive integer). Never a float, never divided/multiplied inline. Render only through `<Money>`. Parse user input only through `parseMinor()` / `formatMinor()` from `@vyaya/shared` (`packages/shared/src/money.ts`).
2. **The ledger is append-only.** There is no "edit amount" — the UI's only correction mechanism is the reversal action (`POST /v1/transactions/:id/reverse`), never a PATCH of `amountMinor`.
3. **Every mutating form generates its idempotency key on mount** (`crypto.randomUUID()`), not on submit. A double-tap or a timeout-then-retry must reuse the same key. Key only rotates after a _confirmed success_ (new form instance / explicit reset).
4. **TypeScript strict, zero escape hatches**: no `any`, no `as` casts (except `as const` and narrowing `unknown` after a runtime check), no `@ts-ignore`, `@ts-expect-error` only in tests with a comment, no `!` non-null assertion, no `enum`. All exported functions have explicit return types.
5. **Types are derived, not duplicated.** Every shape that already has a zod schema in `packages/shared` (`Transaction`, `Account`, `Category`, `CreateTransaction`, …) — import the type, never hand-write an equivalent interface.
6. **Runtime boundaries are parsed with zod, not asserted.** Any `fetch` response body is `unknown` until `Schema.parse()`/`safeParse()`'s run on it.
7. **Server Components by default; `"use client"` only at the interactive leaf.** Route files under `app/` stay thin — they call a `features/*/server` loader and render a `features/*/components` component; no business logic in `app/`.
8. **Feature isolation:** other features (and `app/` routes) may only import a feature via its `index.ts` public surface (`features/transactions/index.ts`, `features/accounts/index.ts`, …). No deep imports like `features/transactions/components/txn-row` from outside the feature.
9. **Definition of done:** `pnpm lint && pnpm typecheck && pnpm test` all pass, zero warnings, zero errors, before you consider any part of this done. Add tests in the same commit as the code, following the existing style in `features/auth/components/login-form.test.tsx` and `lib/api/session.test.ts` (Vitest + Testing Library, mock the client boundary, assert on rendered output / call args — not implementation details).
10. **No new dependency without justification.** Every package added in §3 below is justified against what's already in the repo (see the note under each).

---

## 3. Part A — Generated typed API client (do this first, everything else depends on it)

### Why this part exists

`AGENTS.md` §6 is explicit: _"Data access only through the generated typed API client — no hand-written `fetch` to the API, no direct DB access from Next.js."_ That pipeline (`pnpm gen:client`) doesn't exist yet anywhere in the repo — it needs to be built as the foundation for this feature, not skipped.

**Implementation-note / deviation flagged for the human reviewing this:** `AGENTS.md` names `@nestjs/swagger` specifically. The natural way to get `@nestjs/swagger` to read schemas straight from existing zod schemas is the `nestjs-zod` package (`createZodDto` + `patchNestJsSwagger`) — but as of this writing its zod-v4-compatible release is a beta (v5), and this repo is on zod `^4.4`. Betaware as the foundation of a codegen pipeline that everything else depends on is a bad trade. Use **`@asteasolutions/zod-to-openapi@^8`** instead — it's stable, has first-class zod v4 support (via `.meta()`), and achieves the same goal ("OpenAPI spec generated from the zod schemas that are already the single source of truth, so it can't drift"). It does not require touching any controller's request-parsing code (`Schema.parse(body)` calls stay exactly as they are). If you have a working zod-v4-compatible `nestjs-zod` release available when you implement this, swap it in — the important invariant is "spec generated from `packages/shared` schemas, checked by CI," not the specific library.

### A1 — API: generate the OpenAPI document

1. Add to `apps/api/package.json` dependencies: `"@asteasolutions/zod-to-openapi": "^8"`.
2. Create `apps/api/src/openapi/registry.ts`. For every request/response schema already exported from `packages/shared` (`CreateAccountSchema`, `AccountSchema`, `CreateCategorySchema`, `CategorySchema`, `CreateTransactionSchema`, `TransactionSchema`, `UpdateTransactionSchema`, `ListTransactionsQuerySchema`, `TransactionPageSchema`, `CreateTransferSchema`, `TransferSchema`, `TransferReversalSchema`, plus the error `ProblemDetails` shape — see §8 for its exact fields) register it with `OpenAPIRegistry` and give it a `.openapi("Name")` id. Register each route in the endpoint table in §8 as a `registry.registerPath({...})` entry: method, path (`/v1/accounts`, etc.), request body/query schema, response schema per status code, and `security: [{ cookieAuth: [] }]` for every route except none (all `/v1/*` routes require auth).
3. Create `apps/api/scripts/generate-openapi.ts` (run via `tsx`, same pattern as `scripts/verify-migrations.ts` at the repo root): builds the document with `OpenApiGeneratorV31` from the registry, `JSON.stringify`s it, writes to `apps/api/openapi.json`.
4. Add to `apps/api/package.json` scripts: `"gen:openapi": "tsx scripts/generate-openapi.ts"`.
5. Do **not** wire this into `main.ts` / serve it as a live HTTP endpoint — Phase 2 doesn't need a docs UI, just the static file for the web side to consume. (A `SwaggerModule.setup()` docs page is a reasonable future addition, not required here.)

### A2 — Web: generate types + typed client from the spec

1. Add to `apps/web/package.json`: `"openapi-fetch": "^0.17"` (dependency), `"openapi-typescript": "latest"` (devDependency). Both are small, focused, zero-config-by-default — `openapi-typescript` only emits `.d.ts` types from the spec, `openapi-fetch` is a ~6kb typed wrapper around native `fetch` (no axios, no code generation of request functions — it infers everything from the types). This is the "boring, small footprint" choice consistent with `FRONTEND.md` §12's dependency policy.
2. Add a root-level script in the repo root `package.json`: `"gen:client": "pnpm --filter @vyaya/api gen:openapi && openapi-typescript apps/api/openapi.json -o apps/web/src/lib/api/generated/schema.d.ts"`.
3. Run it once (`pnpm gen:client`) to produce `apps/web/src/lib/api/generated/schema.d.ts`. **Never hand-edit this file** — it's regenerated, and should be committed (so CI/other contributors don't need to run the API to typecheck the web app). Add a CI step (or note for the human wiring CI later) that re-runs `gen:client` and fails the build on a git diff — that's what keeps the client from drifting, per `AGENTS.md` §5.

### A3 — Web: thin client wrappers

Per `FRONTEND.md` §4.1, exactly two wrappers, both built on the same `openapi-fetch` client:

**`apps/web/src/lib/api/client.ts`** (browser-side, for use inside `"use client"` mutation/query hooks):

```ts
import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";

export const apiClient = createClient<paths>({ baseUrl: "/api" });
```

Same-origin relative path — no CORS preflight, cookies flow automatically. Wrap every call site (not the client itself) with the error mapper below.

**`apps/web/src/lib/api/server.ts`** (RSC-side, replaces the hand-rolled part of `session.ts`'s fetch — keep `getSession`'s existing shape, but new loaders use this):

```ts
import { cache } from "react";
import { cookies } from "next/headers";
import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import { generateRequestId } from "../request-id";
import { getApiBaseUrl } from "./base-url";

export const getServerApiClient = cache(async () => {
  const cookieStore = await cookies();
  return createClient<paths>({
    baseUrl: getApiBaseUrl(),
    headers: {
      cookie: cookieStore.toString(),
      "x-request-id": generateRequestId()
    }
  });
});
```

`React.cache()` here means one client instance (and, since `openapi-fetch` doesn't itself dedupe, pair each _call site_ in a feature's `server/` loader with its own `cache()` wrap — same pattern `getSession` already uses) per request.

**Error mapping** (`apps/web/src/lib/api/problem.ts`, new file): `openapi-fetch` returns `{ data, error, response }` — on `error` (which is the parsed JSON body, `unknown` until checked), `safeParse` it against a `ProblemDetailsSchema` (mirror the shape in §8 — add it to `packages/shared/src/errors/` as `ProblemDetailsSchema` so both apps share it, or keep it web-local if you'd rather not touch `packages/shared` for this guide's scope) and throw the matching `lib/errors.ts` subclass:

- `status === 401` → `AuthError`
- `status === 422` → `ValidationError` (attach `errors[]` field pointers so the form layer in §6 can map them to `setError` calls)
- `status === 409` → `ConflictError`
- `status >= 500` or a thrown `TypeError` (network failure) → `NetworkError`
- everything else → base `AppError`

Every mutation/query call site should go through this mapper — never branch on `response.status` inline in a component.

---

## 4. Part B — TanStack Query wiring

### Why

`FRONTEND.md` §4.2–4.3 specifies TanStack Query for the list/mutation layer (staleTime, retry policy, optimistic updates, centralized invalidation) rather than hand-rolled `useState`/`useEffect` fetching. This is a new dependency (`@tanstack/react-query@^5`) — justified because it's the one place `FRONTEND.md` explicitly names as the intended state layer for this exact feature (P6: "no state library until TanStack Query demonstrably isn't enough" — we're at the point where it's needed: optimistic quick-add + infinite scroll + cross-query invalidation on reversal).

### Steps

1. Add `@tanstack/react-query@^5` to `apps/web/package.json` dependencies.
2. `apps/web/src/lib/query/provider.tsx` (new, `"use client"`): a `QueryClientProvider` with one `QueryClient` instance created via `useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 2, refetchOnWindowFocus: true }, mutations: { retry: 0 } } }))`. Mount it in `apps/web/src/app/layout.tsx` wrapping `{children}` (root layout is already async/server — this provider is a client boundary nested inside it, same pattern as any client provider in an RSC tree).
3. `apps/web/src/lib/query/keys.ts` (new) — the **only** place query keys are written, exactly as `FRONTEND.md` §4.2 specifies:
   ```ts
   import type { ListTransactionsQuery } from "@vyaya/shared";

   export const qk = {
     txns: (filters: ListTransactionsQuery) => ["txns", filters] as const,
     accounts: () => ["accounts"] as const,
     categories: () => ["categories"] as const
   } as const;
   ```
4. **RSC → client handoff:** each feature's `server/` loader (§5, §6) fetches the first page/list during SSR using `lib/api/server.ts`, and the route's client component receives it as `initialData` into the corresponding `useQuery`/`useInfiniteQuery` call — no double-fetch, no loading flash. This is the pattern `FRONTEND.md` §4.2 calls out explicitly; don't reach for `dehydrate`/`HydrationBoundary` boilerplate, it's not needed for this scope.

---

## 5. Part C — New design primitives

All new primitives go in `apps/web/src/components/ui/` (zero business logic — pure, reusable, no data fetching, no feature imports) per `FRONTEND.md` §2 structure rules. Follow the exact style of the existing `button.tsx`/`input.tsx` (typed props extending the native HTML element's attributes where relevant, `className` merge via `.filter(Boolean).join(" ")`, token classes only).

1. **`amount-input.tsx`** — `<AmountInput value={minor: number} onChange={(minor: number) => void} id label />`. Internally keeps a _string_ draft in local state (what the user is typing, e.g. `"1,250.5"`), calls `parseMinor()` from `@vyaya/shared` on blur/change to derive the committed `minor` value, catches the `RangeError` `parseMinor` throws on invalid input and shows an inline error instead of crashing. `inputMode="decimal"`, `type="text"` (not `type="number"` — need full control over formatting, matches `FRONTEND.md` §5's spec for this exact primitive). Money in form state is **always** the integer-paise number, never the display string, except for the input's own local draft.
2. **`skeleton.tsx`** — a plain pulsing placeholder block (`animate-pulse bg-surface-muted rounded-md`), respect `prefers-reduced-motion` (no shimmer/pulse animation when it's set — Tailwind's `motion-reduce:` variant). Used by `transactions/loading.tsx` and the quick-add account/category selects while they load.
3. **`empty-state.tsx`** — `<EmptyState title description action? />`, same visual language as the existing `coming-soon.tsx` (reuse its border/accent-bar styling — this is effectively `ComingSoon`'s general-purpose cousin). Used for "no transactions yet" and "no accounts yet" (§7).
4. **`badge.tsx`** — small pill, variants at minimum `reversed` (uses `--color-reversed` token) and `pending` (greyed, for the optimistic row before server confirmation — `--color-foreground-muted`).

**Ledger row anatomy** (`FRONTEND.md` §6 "signature element") — this is a **feature** component, not a `ui/` primitive, because it encodes transaction-specific business meaning (linkage, status). Build it as `features/transactions/components/txn-row.tsx`:

- Tabular-numeric amount right-aligned (`<Money minor={amountMinor} variant={type} signed />`), income/expense encoded by color _and_ the `+`/`−` sign from `<Money signed>` (never color alone — a11y).
- `description` + `occurredAt` (formatted, e.g. `Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })` — dates over the wire are UTC ISO, display in IST) + category name if present, left-aligned.
- **Linkage** (the Gate 2 requirement "both entries visible in history with linkage"): if `status === "reversed"`, render a `<Badge variant="reversed">Reversed</Badge>` and visually de-emphasize the row (reduced opacity or `text-foreground-muted`, amount strikethrough via `line-through` — pick one, keep it consistent). If `status === "reversal"`, render a small connecting mark in the row's left gutter (a 1px accent-colored vertical bar, matching the existing `coming-soon.tsx`/dashboard-card left-accent-bar visual motif already in the codebase) and a `"Reversal of: <original description>"` caption. Both rows should be findable from one another — either link `reversalOf`/`reversedBy` to scroll-to/highlight the paired row in the same list, or (simpler, fine for this scope) just show the caption text; a dedicated `[id]/page.tsx` detail view with both transactions side by side is a nice-to-have, not required for Gate 2.
- Tap/click target for the reverse action only on `status === "posted"` rows (can't reverse a reversal or an already-reversed transaction — the API 409s on both, see §8).

---

## 6. Part D — Feature: Transactions list (`features/transactions/`)

Extend the existing `features/transactions/` folder (currently just `model/filters.ts` + `index.ts`).

**`features/transactions/server/get-txn-page.ts`** (new): RSC loader, `cache()`-wrapped, takes `ListTransactionsQuery`, calls `getServerApiClient()` then `GET /v1/transactions` with the query params, returns the zod-parsed `TransactionPage` (`{ items, pageInfo }`). Fails closed like `getSession` does — on any error, return `{ items: [], pageInfo: { nextCursor: null, hasMore: false, limit: filters.limit } }` rather than throwing (a broken transaction list shouldn't crash the whole page); log via `debug.api`.

**`features/transactions/hooks/use-txn-list.ts`** (new, `"use client"`): `useInfiniteQuery` keyed by `qk.txns(filters)`, `initialData` seeded from the RSC loader's first page (§4 step 4), `getNextPageParam` reads `pageInfo.nextCursor`/`hasMore`, calls `apiClient.GET("/v1/transactions", { params: { query: { ...filters, cursor } } })` through the browser client + error mapper from §3.

**`features/transactions/components/txn-list.tsx`** (new, `"use client"`): renders `<TxnRow>` per item, an "empty" state via `<EmptyState>` when `items.length === 0`, a "load more" trigger at the bottom (intersection observer or a simple button — either is fine, keep it simple) wired to `fetchNextPage`.

**`apps/web/src/app/(app)/transactions/page.tsx`** (replace the `ComingSoon` stub):

```tsx
import type { ReactNode } from "react";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";
import { parseTransactionFilters } from "@/features/transactions/model/filters";
import { TxnList } from "@/features/transactions/components/txn-list";
import type { TransactionSearchParams } from "@/features/transactions/model/filters";

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<TransactionSearchParams>;
}): Promise<ReactNode> {
  const filters = parseTransactionFilters(await searchParams);
  const firstPage = await getTxnPage(filters);
  return <TxnList filters={filters} initialPage={firstPage} />;
}
```

(Filter _controls_ — account/category/date-range/search inputs that write back to the URL via `serializeTransactionFilters` — are a reasonable stretch addition but not required for the Gate 2 demo, which just needs the list + reverse working. If you build them, they're client components inside `txn-list.tsx` or a sibling `txn-filters.tsx`, pushing to the URL with `router.push`/`replace` so back-button and sharable links keep working per `FRONTEND.md` §3.)

`apps/web/src/app/(app)/transactions/loading.tsx` (new): a skeleton list (5–8 `<Skeleton>` rows).

Add `features/transactions/index.ts` exports: `TxnList` (and any filter-control component if built). Nothing else from this feature is imported from outside it.

---

## 7. Part E — Feature: Quick-add (`features/quick-add/`, new)

New feature folder, per `FRONTEND.md`'s split (quick-add is called out as a _separate_ feature from `transactions`, since it's the offline-capable capture flow in later phases — keeping it separate now avoids a rename later).

**Dependencies:** `react-hook-form@^7`, `@hookform/resolvers@^3` (for `zodResolver`) — added to `apps/web/package.json`. Justified: `FRONTEND.md` §5 specifies this exact combination so the _same_ zod schema (`CreateTransactionSchema` from `packages/shared`) validates both client-side (instant feedback) and server-side (source of truth) — "a validation rule can't diverge between client and server because it exists once."

**`features/quick-add/hooks/use-accounts.ts`** and **`use-categories.ts`**: plain `useQuery` (`qk.accounts()` / `qk.categories()`) hitting `GET /v1/accounts` / `GET /v1/categories` via `apiClient`. These lists are small and change rarely — no pagination needed (both endpoints already return the full array, no envelope).

**`features/quick-add/hooks/use-create-txn.ts`** — the idempotent-mutation hook, follow `FRONTEND.md` §4.3's shape exactly:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTransaction } from "@vyaya/shared";
import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useCreateTxn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransaction & { idempotencyKey: string }) => {
      const { idempotencyKey, ...body } = input;
      const { data, error } = await apiClient.POST("/v1/transactions", {
        body,
        headers: { "Idempotency-Key": idempotencyKey }
      });
      if (error !== undefined) throw toAppError(error);
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["txns"] });
      void qc.invalidateQueries({ queryKey: qk.accounts() }); // balanceMinor changed
    }
  });
}
```

Optimistic insert (the "pending" greyed row from `FRONTEND.md` §4.3) is a nice-to-have polish item — the _required_ Gate 2 behavior (exactly one transaction on double-submit) is already guaranteed by the idempotency key + `retry: 0` on mutations; don't skip the key generation below to save time, that part is load-bearing.

**`features/quick-add/components/quick-add-form.tsx`** (new, `"use client"`):

- `const [idempotencyKey] = useState(() => crypto.randomUUID());` — **on mount, not on submit**, per rule §2.3. Do not regenerate it on every render (that's why it's `useState` initializer, not a plain `crypto.randomUUID()` call in the render body) — only replace it (e.g. `setIdempotencyKey(crypto.randomUUID())`) after a _confirmed_ successful submit, so the form is ready for the next entry.
- `useForm<CreateTransaction>({ resolver: zodResolver(CreateTransactionSchema) })` from `packages/shared`.
- Fields: type toggle (`expense`/`income` — two `Button variant="secondary"` acting as a segmented control, or radio styled as pills), `<AmountInput>` bound to `amountMinor`, account `<select>` populated from `useAccounts()` (if empty, render `<EmptyState>` — see note below, don't let the form silently be unusable), category `<select>` populated from `useCategories()` filtered by `kind` matching the selected `type` (a category has `kind: "expense"|"income"`; only show matching ones — not enforced by the API schema, but bad UX to let it mismatch), `<Input>` for `description` (required, 1–500 chars per the schema), `occurredAt` defaulting to `new Date()` (send as-is, the API/schema coerces it), tags optional (skip for MVP — schema defaults to `[]`).
- Server-side `422` errors (from `ValidationError` in §3, carrying `errors: [{ path, code, message }]`) map onto form fields via RHF's `setError(path, { message })` — no generic toast for field-level validation failures, per `FRONTEND.md` §5.
- On success: reset the form, rotate the idempotency key, show a brief confirmation (a toast, or simply navigate to `/transactions` — either is fine for Gate 2; a toast primitive isn't built yet and isn't required, don't build a whole toast system just for this).

**No accounts/categories exist in a fresh database.** Since account/category _creation_ UI is explicitly out of scope for this guide (§0), the quick-add form's empty state for "no accounts yet" should say so plainly and give the exact `curl` command to create one (mirroring how the very first user account gets created — see the bootstrap note below), e.g.:

```
No accounts yet. Create one:
curl -X POST http://localhost:4000/api/v1/accounts \
  -H "Content-Type: application/json" -b "<your session cookie>" \
  -d '{"name":"Cash","type":"cash","openingBalanceMinor":0}'
```

This isn't a permanent UX (a follow-up task should add minimal account/category management, matching `FRONTEND.md`'s `(app)/accounts/page.tsx` in its target file tree), but it unblocks testing Gate 2 without scope-creeping this guide into building settings screens.

**`apps/web/src/app/(app)/add/page.tsx`** (replace the `ComingSoon` stub): thin RSC wrapper rendering `<QuickAddForm>` — per `FRONTEND.md` §3, this route is "client component, statically rendered shell" (no server data-fetch needed at the route level; the form's own hooks fetch accounts/categories client-side).

Add `features/quick-add/index.ts` exporting `QuickAddForm`.

---

## 8. Part F — Feature: Reverse (undo)

Add to `features/transactions/` (it's a transaction-list action, not a separate feature):

**`features/transactions/hooks/use-reverse-txn.ts`**:

```ts
export function useReverseTxn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, error } = await apiClient.POST("/v1/transactions/{transactionId}/reverse", {
        params: { path: { transactionId } }
      });
      if (error !== undefined) throw toAppError(error);
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["txns"] });
      void qc.invalidateQueries({ queryKey: qk.accounts() });
    }
  });
}
```

No idempotency key needed here (the reverse endpoint isn't gated by `Idempotency-Key`; the API's own race-safety for concurrent reverse calls is handled server-side per `HANDOFF.md` — a double-tap on undo either 409s harmlessly after the first succeeds, or replays the same reversal — either way, exactly one reversal is ever created).

**UI:** an "Undo"/"Reverse" button on `<TxnRow>`, visible only when `status === "posted"` (§5). Confirm-before-destructive-action is reasonable (a native `confirm()` is banned per the Claude-in-Chrome tooling note elsewhere in this repo's tooling, but that restriction is about _browser automation_, not app UX — a real confirm dialog in the shipped app is fine; use a lightweight inline "tap again to confirm" pattern if you want to avoid a dialog primitive that doesn't exist yet, or just fire immediately — reversal is itself undoable by construction, it's not actually destructive).

On success, `onSettled` invalidates the list — the row flips to `reversed` styling and the new reversal row appears (§5's linkage rendering) via the refetch. An optimistic instant-flip (row greys out before the server responds, per `FRONTEND.md` §4.3 "the row flips to reversed styling immediately; on error it flips back with a toast") is polish, not required.

---

## 9. Appendix — API reference (exact, verified against the current controllers)

All routes are prefixed `/api` (global prefix) then the controller path below — e.g. `GET /api/v1/transactions`. Every route requires an authenticated session (cookie); `AuthGuard` 401s otherwise via `UnauthenticatedError`.

| Method  | Path                                      | Body / Query                                                                                                     | Response                                                                                       | Notes                                                                                                        |
| ------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET`   | `/v1/accounts`                            | —                                                                                                                | `Account[]`                                                                                    | no pagination, no filter                                                                                     |
| `POST`  | `/v1/accounts`                            | `CreateAccount`                                                                                                  | `Account` (201)                                                                                |                                                                                                              |
| `PATCH` | `/v1/accounts/:accountId/archive`         | —                                                                                                                | 204                                                                                            | archive-not-delete; 404 if not found or not owned                                                            |
| `GET`   | `/v1/categories`                          | —                                                                                                                | `Category[]`                                                                                   |                                                                                                              |
| `POST`  | `/v1/categories`                          | `CreateCategory`                                                                                                 | `Category` (201)                                                                               |                                                                                                              |
| `PATCH` | `/v1/categories/:categoryId/archive`      | —                                                                                                                | 204                                                                                            |                                                                                                              |
| `GET`   | `/v1/transactions`                        | `ListTransactionsQuery` (query string)                                                                           | `TransactionPage` = `{ items: Transaction[], pageInfo: PageInfo }`                             | cursor pagination, see below                                                                                 |
| `POST`  | `/v1/transactions`                        | `CreateTransaction` + header `Idempotency-Key: <uuid>`                                                           | `Transaction` (201, `Location` header) or (200, `Idempotency-Replayed: true` header) on replay | **the quick-add endpoint**                                                                                   |
| `PATCH` | `/v1/transactions/:transactionId`         | `UpdateTransaction` (`description`/`tags`/`categoryId` only — `categoryId: null` clears it, omitted = untouched) | `Transaction`                                                                                  | never touches amount/type/account — not needed for this guide's scope                                        |
| `POST`  | `/v1/transactions/:transactionId/reverse` | —                                                                                                                | `Transaction` (200) — the **new reversal transaction**                                         | 404 if the transaction never existed; 409 `txn.already_reversed` if already reversed or is itself a reversal |

**`ListTransactionsQuery`** (all optional except none — every field optional, `limit` defaults 50, max 100): `accountId`, `categoryId`, `from` (ISO date), `to` (ISO date), `q` (description substring, case-insensitive), `cursor` (opaque, from previous page's `pageInfo.nextCursor`), `limit`.

**`Account`**: `{ id, userId, name, type: "bank"|"credit_card"|"cash"|"wallet"|"investment", currency: "INR", openingBalanceMinor, balanceMinor, isArchived, createdAt, updatedAt }`.

**`Category`**: `{ id, userId, name, kind: "expense"|"income", parentId?, icon?, color?, isArchived, createdAt, updatedAt }`.

**`Transaction`**: `{ id, userId, accountId, categoryId?, type: "expense"|"income", amountMinor, currency: "INR", occurredAt, description, tags: string[], source, status: "posted"|"reversed"|"reversal", idempotencyKey?, reversalOf?, reversedBy?, transferGroupId?, createdAt, updatedAt }`.

**Error shape** (every non-2xx response, `application/problem+json`):

```ts
type ProblemDetails = {
  type: string; // "https://vyaya.app/problems/<code>"
  title: string;
  status: number;
  detail: string;
  instance: string; // the request path
  code: string; // stable machine-readable code, branch on this — see catalog below
  reqId: string;
  timestamp: string; // ISO
  retryable: boolean;
  errors: { path: string; code: string; message: string }[] | null; // populated on 422 only
};
```

Current error-code catalog (`packages/shared/src/errors/codes.ts`): `common.validation_failed` (422), `common.not_found` (404), `common.invalid_cursor` (400), `common.internal` (500), `common.dependency_unavailable` (503, retryable), `auth.unauthenticated` (401), `txn.already_reversed` (409), `asset.invalid_valuation_sign` (422, not relevant here).

---

## 10. Testing checklist (maps 1:1 to Gate 2)

Write these as Vitest + Testing Library component/hook tests (mock `apiClient`/`getServerApiClient`, same style as `login-form.test.tsx`) **and** confirm manually in the browser before calling this done — per this repo's global instructions, UI work isn't "done" on green tests alone:

- [ ] Quick-add: submitting a valid expense calls `POST /v1/transactions` with a UUID `Idempotency-Key` header that was generated at mount, not at submit (assert the same key is reused if you simulate a second submit before the first resolves).
- [ ] Quick-add: two rapid submits (simulating a double-tap) result in exactly one `useMutation` call actually reaching a _new_ transaction — the second either resolves to the replayed result or is prevented by disabling the submit button while pending (either satisfies "exactly one transaction"; disabling-while-pending is simpler and sufficient).
- [ ] Quick-add: a `422` response with `errors: [{ path: "amountMinor", ... }]` surfaces on the amount field via `setError`, not a generic toast.
- [ ] Quick-add: amount entry never produces a float in form state — `AmountInput`'s committed value is always `Number.isSafeInteger`.
- [ ] Transaction list: renders `<Money signed>` with correct sign/color per `type`.
- [ ] Transaction list: a `status: "reversed"` row and its paired `status: "reversal"` row both render distinguishable linkage markers (badge / gutter mark / caption — whichever you built).
- [ ] Reverse: clicking undo on a `posted` row calls the reverse endpoint and (after invalidation) the row's status flips.
- [ ] Reverse: the undo control does not render on `reversed`/`reversal` rows.
- [ ] **Manual, in the browser:** add a ₹20 "Chai" expense → account balance (refetch `/v1/accounts` or reload dashboard) decreases by ₹20 → hit undo → balance is back to the pre-chai value → both the original (reversed) and the reversal entry are visible in the list with the linkage marker.
- [ ] **Manual:** open devtools, throttle to slow 3G, double-click submit fast → exactly one transaction lands (check `GET /v1/transactions` afterward, or the DB directly).

---

## 11. Definition of done

```bash
pnpm gen:client        # regenerate, commit if the spec changed
pnpm lint
pnpm typecheck
pnpm test
```

All green, zero warnings. Plus the manual checks in §10. Then it's fair to say Phase 2 (`IMPLEMENTATION-PLAN.md`) and Gate 2 are closed.

# TreasuryOps — Frontend Architecture (Next.js, Production-Grade)

> Companion to `BACKEND.md`, `AGENTS.md`. Stack: **Next.js 15 App Router · React 19 · TypeScript strict · Tailwind v4 · TanStack Query v5 · react-hook-form + zod · generated typed API client**. Deployed as the `web` container behind nginx on :3006 (see `DEPLOYMENT-TREASURY-OPS.md`).
>
> **Design brief in one line:** a fast, mobile-first ledger you use one-handed on a moving Mumbai local — quick-add in under 5 seconds, dashboards that load from rollups instantly, and zero trust placed in the network being reliable.

---

## 1. Principles (every decision below traces to one of these)

| #   | Principle                              | Consequence                                                                                                       |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P1  | **Server-first rendering**             | Server Components by default; `"use client"` is opt-in at the leaves, never at layouts                            |
| P2  | **The API is the only data source**    | No DB access from Next.js, no hand-written `fetch` — only the generated typed client                              |
| P3  | **One schema, everywhere**             | zod schemas in `packages/shared` drive form validation, client types, and API contracts                           |
| P4  | **The network is hostile**             | Trains, tunnels, dead zones: idempotency keys on every mutation, optimistic UI, offline quick-add queue           |
| P5  | **Money renders through one function** | `formatMinor()` only. No inline `/100`. Ever.                                                                     |
| P6  | **Boring and obvious wins**            | Feature-sliced structure, no clever abstractions, no state library until TanStack Query demonstrably isn't enough |

---

## 2. File Structure (feature-sliced, long-term)

```
apps/web/
├─ next.config.ts
├─ middleware.ts                      # session-cookie presence check → redirect to /login
├─ instrumentation.ts                 # OTel registration (server side)
│
├─ src/
│  ├─ app/                            # ROUTES ONLY — thin files that compose features
│  │  ├─ layout.tsx                   # html/body, fonts, ThemeProvider, QueryProvider
│  │  ├─ globals.css                  # Tailwind v4 @theme tokens (single source of design tokens)
│  │  ├─ manifest.ts                  # PWA manifest
│  │  ├─ (auth)/                      # route group: no app chrome
│  │  │  ├─ login/page.tsx
│  │  │  └─ layout.tsx                # centered card shell
│  │  ├─ (app)/                       # route group: authenticated shell
│  │  │  ├─ layout.tsx                # nav (bottom tab bar on mobile, sidebar ≥md), session guard
│  │  │  ├─ page.tsx                  # dashboard (RSC, streams from rollups)
│  │  │  ├─ transactions/
│  │  │  │  ├─ page.tsx               # RSC: first page server-rendered; client infinite scroll after
│  │  │  │  ├─ loading.tsx            # skeleton
│  │  │  │  └─ [id]/page.tsx          # detail + reversal linkage view
│  │  │  ├─ add/page.tsx              # quick-add (THE screen; reachable in one tap from anywhere)
│  │  │  ├─ imports/
│  │  │  │  ├─ page.tsx               # batch history
│  │  │  │  ├─ new/page.tsx           # upload + mapping
│  │  │  │  └─ [batchId]/preview/page.tsx
│  │  │  ├─ accounts/page.tsx
│  │  │  ├─ budgets/page.tsx
│  │  │  ├─ reports/
│  │  │  │  ├─ page.tsx
│  │  │  │  └─ [month]/page.tsx
│  │  │  ├─ recurring/page.tsx
│  │  │  └─ settings/page.tsx         # profile, categories, passkeys, export
│  │  ├─ api/                         # ONLY Next-owned endpoints (none proxy business data)
│  │  │  └─ offline-sync/route.ts     # drains the offline quick-add queue (calls API with stored keys)
│  │  ├─ error.tsx                    # root error boundary
│  │  ├─ not-found.tsx
│  │  └─ global-error.tsx             # last-resort (GlitchTip report + reload CTA)
│  │
│  ├─ features/                       # THE CODEBASE LIVES HERE — one folder per domain
│  │  ├─ transactions/
│  │  │  ├─ components/               # TxnList, TxnRow, TxnDetail, ReverseDialog, AmountInput
│  │  │  ├─ hooks/                    # useTxnList (infinite), useCreateTxn, useReverseTxn
│  │  │  ├─ server/                   # RSC data loaders: getTxnFirstPage(searchParams)
│  │  │  ├─ lib/                      # feature-local pure logic (filter serialization)
│  │  │  └─ index.ts                  # PUBLIC API of the feature — the only import path allowed
│  │  ├─ quick-add/                   # separate feature: the offline-capable capture flow
│  │  ├─ imports/                     # dropzone, mapping editor, preview table, commit progress
│  │  ├─ accounts/
│  │  ├─ budgets/
│  │  ├─ reports/                     # chart components live here, not in ui/
│  │  ├─ recurring/
│  │  ├─ auth/                        # login form, passkey button, useSession, signOut
│  │  └─ ask/                         # Phase 6: natural-language reports UI (streaming)
│  │
│  ├─ components/
│  │  └─ ui/                          # DESIGN SYSTEM primitives only — zero business logic
│  │     ├─ button.tsx  input.tsx  dialog.tsx  sheet.tsx  toast.tsx
│  │     ├─ money.tsx                 # <Money minor={} /> — the ONLY money renderer (P5)
│  │     ├─ empty-state.tsx  skeleton.tsx  badge.tsx  tabs.tsx
│  │     └─ category-icon.tsx
│  │
│  ├─ lib/                            # app-wide infrastructure (no React in most of it)
│  │  ├─ api/
│  │  │  ├─ client.ts                 # fetch wrapper: baseURL, problem+json→AppError, request-id
│  │  │  ├─ server.ts                 # RSC variant: forwards cookies, per-request memoized
│  │  │  └─ generated/                # openapi-typescript output — NEVER edited by hand
│  │  ├─ query/
│  │  │  ├─ provider.tsx              # QueryClient config (see §5)
│  │  │  └─ keys.ts                   # centralized query-key factory
│  │  ├─ offline/
│  │  │  ├─ queue.ts                  # IndexedDB outbox for quick-add (see §7)
│  │  │  └─ sync.ts                   # drain-on-reconnect logic
│  │  ├─ auth/client.ts               # Better Auth client instance
│  │  ├─ money.ts                     # re-export from packages/shared (single import path)
│  │  ├─ time.ts                      # IST helpers, re-exported from shared
│  │  └─ errors.ts                    # AppError taxonomy mirrored from API problem types
│  │
│  ├─ hooks/                          # cross-feature hooks only (useMediaQuery, useOnline)
│  └─ styles/                         # font files, chart theme
│
├─ e2e/                               # Playwright specs + fixtures
├─ tests/                             # vitest setup, MSW handlers (from OpenAPI), test utils
└─ public/                            # icons, PWA assets
```

**Structure rules (enforced by ESLint `import/no-restricted-paths`):**

1. `app/` imports from `features/` and `components/ui/` — never the reverse. Route files stay under ~30 lines: fetch via feature's `server/`, render feature components.
2. Features import other features **only via their `index.ts`** public API. Deep imports (`features/imports/components/...` from outside) are lint errors — this is what keeps a 2-year-old codebase refactorable.
3. `components/ui/` imports nothing from `features/` or `lib/api/`. Primitives are dumb.
4. Anything imported by 3+ features graduates to `lib/` or `packages/shared` — by rule, not by taste.

---

## 3. Rendering Strategy (per route, decided up front)

| Route           | Strategy                                                                                             | Why                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Dashboard `/`   | RSC + `<Suspense>` streaming; balances card streams before charts                                    | Reads `monthly_rollups` — cheap; stream so first paint is instant on Jio in a tunnel |
| `/transactions` | Hybrid: first page RSC (real HTML, sharable/filterable URL) → hands cursor to client infinite scroll | Best of both: fast first paint + smooth pagination without full reloads              |
| `/add`          | Client component, statically rendered shell                                                          | Must be interactive instantly; works offline (§7)                                    |
| `/imports/*`    | Client-heavy (file handling, editable preview table) inside RSC shell                                | Inherently interactive                                                               |
| `/reports/*`    | RSC data + client chart components (`recharts` dynamic-imported)                                     | Charts are the only heavy JS — keep them out of the main bundle                      |
| `/login`        | Static shell + client form                                                                           | —                                                                                    |

**Global rules:**

- `searchParams` are the state for anything filterable (date range, account, category) — URLs are sharable and back-button works. Client state (`useState`) only for ephemeral UI (dialog open, form drafts).
- No `force-dynamic` blanket flags. Each route declares its caching intent explicitly.
- Server Actions are **not used for business mutations** — the NestJS API owns writes (P2), and mutations need idempotency keys + optimistic updates that TanStack Query handles better. Server Actions allowed only for Next-local concerns (theme cookie).

---

## 4. Data Layer

### 4.1 Generated client (the contract)

- `pnpm gen:client` runs `openapi-typescript` against the API's published spec → `lib/api/generated/`. CI regenerates and fails on diff, so the checked-in client can never drift from the API.
- Two thin wrappers around it:
  - **`lib/api/server.ts`** (RSC): injects `cookies()` for the Better Auth session, sets `x-request-id`, wraps in `React.cache()` so one request = one fetch per resource, talks to the API over the compose network (`http://api:4000`) — never round-trips through nginx.
  - **`lib/api/client.ts`** (browser): relative `/api` base (nginx routes it), maps RFC 7807 problem+json to typed `AppError`s, no retries on mutations (idempotency makes retry safe, but retry policy lives in TanStack Query where it's visible).

### 4.2 TanStack Query conventions

```ts
// lib/query/keys.ts — the ONLY place query keys are written
export const qk = {
  txns: (filters: TxnFilters) => ["txns", filters] as const,
  txn: (id: string) => ["txn", id] as const,
  accounts: () => ["accounts"] as const,
  rollup: (month: string) => ["rollup", month] as const,
  batches: () => ["import-batches"] as const,
  preview: (batchId: string) => ["import-preview", batchId] as const
} as const;
```

- **Defaults:** `staleTime: 60s` (matches the API's Redis cache TTL), `retry: 2` queries / `retry: 0` mutations, `refetchOnWindowFocus: true` (phone unlock = fresh balances).
- **RSC → client handoff:** server loaders pass `initialData` into hooks — no double fetch, no loading flash on hydration.
- **Invalidation is centralized** in each mutation hook: `useCreateTxn` invalidates `txns`, `accounts`, current `rollup`. A mutation that forgets invalidation is a bug class — code review checklist item.

### 4.3 Mutations: optimistic + idempotent (P4)

Every mutation hook follows one shape:

```ts
export function useCreateTxn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTxnInput & { idempotencyKey: string }) =>
      api.txns.create(input, { headers: { "Idempotency-Key": input.idempotencyKey } }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.txns(currentFilters) });
      const prev = qc.getQueryData(qk.txns(currentFilters));
      qc.setQueryData(qk.txns(currentFilters), optimisticallyPrepend(input)); // greyed "pending" row
      return { prev };
    },
    onError: (_e, _in, ctx) => qc.setQueryData(qk.txns(currentFilters), ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["txns"] })
  });
}
```

- The **idempotency key is generated when the form mounts** (`crypto.randomUUID()`), not on submit — a double-tap or a timeout-then-retry reuses the same key and the API dedupes. Key rotates only after confirmed success.
- Reversal gets a distinct optimistic treatment: the row flips to `reversed` styling immediately; on error it flips back with a toast.

---

## 5. Forms & Validation (one schema, three enforcement points — P3)

- **react-hook-form + `@hookform/resolvers/zod`**, resolver fed by the _same_ schema from `packages/shared` the API validates with. A validation rule can't diverge between client and server because it exists once.
- **`<AmountInput>`** is a dedicated primitive: renders ₹ display formatting (Indian digit grouping via `Intl.NumberFormat('en-IN')`), stores **integer paise** in form state, numeric keypad on mobile (`inputMode="decimal"`), blocks `e`, blocks >2 decimals at the keystroke level. Money never exists as a float in form state (P5).
- Quick-add UX budget: **≤5s, one hand** — amount keypad auto-focused, last-used account preselected, 8 most-frequent categories as tap chips (frequency from a lightweight endpoint), description optional, date defaults to now-IST with a "yesterday" chip.
- Server-side errors (problem+json `422` with field pointers) are mapped back onto form fields via `setError` — no generic "something failed" toasts for validation.
- Import mapping editor persists per-account mapping through the API and previews the first 5 parsed rows live as the mapping changes.

---

## 6. Design System (small, owned, token-driven)

- **Tokens in Tailwind v4 `@theme`** in `globals.css` — the only place colors/spacing/type are defined. Semantic, not raw: `--color-income`, `--color-expense`, `--color-reversed`, `--color-surface`, etc. Dark mode and accent preferences are cookie-backed and resolved in the root layout before first paint. Accent presets use CSS token sets; validated custom hex/RGB/HSL input is normalized to hex and deterministically derives contrast-safe light/dark token sets. Reset removes the accent cookie and restores the original TreasuryOps green. Semantic money, status, category, and chart colors never follow the accent preference.
- **Primitives are hand-rolled on Radix UI headless** (dialog, sheet, tabs, toast) — Radix for a11y/focus mechanics, our tokens for skin. No component-library dependency to fight later; this app has ~12 primitives, owning them is cheaper than theming someone else's.
- **Signature element — the ledger row:** transactions render like passbook entries: tabular-numeric amounts right-aligned in a fixed column (`font-variant-numeric: tabular-nums`), income/expense encoded by color _and_ sign (a11y), reversed pairs visually linked by a connecting mark in the gutter. Reports and imports reuse the same row anatomy, so the whole app reads as one ledger.
- **`<Money>`** (P5): the only component that renders currency. Props: `minor`, `signed?`, `compact?` (₹1.2L Indian abbreviations for dashboards). Snapshot-tested against the paisa edge cases.
- Mobile-first layout: bottom tab bar (Home / Transactions / **Add** center FAB / Reports / More) under `md`; sidebar above. Touch targets ≥44px. Safe-area insets respected (`env(safe-area-inset-*)`) for the PWA.
- Typography: system font stack + `tabular-nums` everywhere numbers appear. No display-font vanity on a data app; the numbers are the identity.
- A11y floor, enforced not aspirational: visible focus rings, `prefers-reduced-motion` respected (skeletons don't shimmer, dialogs don't slide), all charts have data-table fallbacks (`sr-only` table), color never the sole encoder. `eslint-plugin-jsx-a11y` + axe checks in Playwright.

---

## 7. Offline & PWA (the commute feature — P4)

Scope discipline: **only quick-add works offline.** Trying to make the whole app offline-first (syncing lists, conflict resolution) is a swamp; capturing an expense in a tunnel is the actual need.

- **PWA:** `manifest.ts` + Serwist service worker. Precache the app shell + `/add` route assets; runtime `staleWhileRevalidate` for static assets only — **never cache `/api` responses** (a stale balance is worse than no balance).
- **Offline outbox:** submitting quick-add while offline writes `{payload, idempotencyKey, createdAt}` to an **IndexedDB queue** (`lib/offline/queue.ts`). UI confirms honestly: "Saved on device — will sync when online" with a pending badge on the tab bar.
- **Drain:** on `online` event + app focus, `lib/offline/sync.ts` posts queued entries oldest-first with their stored idempotency keys. Success → remove from queue + invalidate queries. `409`/duplicate → treat as success (it already landed — the key did its job). `422` → surface a "needs attention" list; never silently drop a money entry.
- **Why not background-sync API:** flaky iOS support; foreground drain on the same phone that captured it is reliable and debuggable.
- Session note: Better Auth cookie lives 30 days; the offline queue never contains credentials — if the session died, drained entries 401 and the queue survives until after re-login.

---

## 8. Error Handling & Observability

- **Error taxonomy** mirrors the API: `AppError` subclasses (`ValidationError`, `AuthError`, `ConflictError`, `NetworkError`) built from problem+json `type`. Components branch on class, never on message strings or status codes inline.
- **Boundaries at three levels:** route segment `error.tsx` (retry button, keeps app shell), root `error.tsx`, and `global-error.tsx` (GlitchTip report + reload). Feature components never render their own try/catch UI for unexpected errors — they throw to the boundary.
- **GlitchTip (browser SDK):** captures boundary errors + unhandled rejections, tagged with the same `x-request-id` the API logged — one id, full stack trace on both sides. Offline-queue failures are breadcrumbed.
- **Web-vitals** posted to a tiny `/api/v1/vitals` endpoint → Prometheus. Budgets asserted in CI (Lighthouse CI on the built container): LCP < 2.0s / TBT < 200ms / CLS < 0.1 on simulated mid-tier Android + slow 4G — the actual Metro condition, not an M-series laptop.
- Bundle discipline: `@next/bundle-analyzer` in CI with a hard budget — first-load JS < 150KB gzip for `(app)` routes; charts and CSV-preview table are `next/dynamic` islands. A PR that busts the budget fails.

---

## 9. Auth Integration

- Better Auth **client SDK** (`lib/auth/client.ts`) for login/logout/passkey ceremonies; `useSession()` re-exported from `features/auth` so components never import the SDK directly (swap-ability + one place for session typing).
- `middleware.ts` does a cheap cookie-presence check for `(app)` routes → redirect `/login?next=...`. Real verification happens at the API on every request — middleware is UX, not security.
- RSC session access via `getSession()` helper (cookie-forwarded API call, `React.cache()`d).
- Passkey button renders conditionally on `window.PublicKeyCredential` **and** secure context — on plain-HTTP LAN it hides itself with a hint ("available once HTTPS is set up"), matching the deployment reality.
- 401 from any client call → single global handler: purge query cache, snapshot the offline queue (survives logout), redirect to login with return URL.

---

## 10. Testing Strategy (frontend slice — complements TEST-PLAN.md)

| Layer     | Tooling                                                                                | What it proves                                                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                                                                                 | money/time utils re-exports, cursor/filter serialization, offline queue logic (fake IndexedDB), query-key factory                                                                                                             |
| Component | Vitest + Testing Library + **MSW (handlers generated from the OpenAPI spec)**          | forms validate with shared schemas; optimistic flows: mock a 2s create → pending row appears → server error → row rolls back + toast                                                                                          |
| Visual    | Storybook for `components/ui/` + Chromatic-style snapshots (or Playwright screenshots) | `<Money>` edge cases, ledger row states (posted/pending/reversed), dark mode                                                                                                                                                  |
| E2E       | Playwright against the full compose stack (same containers as prod)                    | login → quick-add → balance moved → reverse → balance restored; CSV upload → preview → commit → revert; **offline drill:** `context.setOffline(true)` → quick-add → back online → entry lands exactly once (asserted via API) |
| A11y      | axe in Playwright on every route                                                       | zero serious/critical violations gate                                                                                                                                                                                         |
| Perf      | Lighthouse CI on built container                                                       | budgets from §8                                                                                                                                                                                                               |

MSW handlers being generated from the same OpenAPI spec as the client means a contract change breaks tests at compile time, not in production.

---

## 11. Phased Delivery (maps to IMPLEMENTATION-PLAN.md gates)

| Phase          | Frontend scope                                                                                                                  | Exit demo                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **F1** (P1–P2) | App shell, auth pages, design tokens + primitives, quick-add (online only), transactions list + detail + reverse                | Add chai on the phone, undo it, both entries linked in UI                              |
| **F2** (P3)    | Imports: dropzone, mapping editor, preview table with dupe badges + row toggles, commit progress, batch revert                  | Real HDFC CSV imported and reverted from the browser                                   |
| **F3** (P4)    | Dashboard streaming from rollups, budgets UI with threshold bars, recurring manager                                             | Dashboard first paint < 1s on throttled 4G                                             |
| **F4** (P5)    | Reports + dynamic-imported charts, settings/export, **PWA + offline quick-add**, passkey flow (behind secure-context check)     | Airplane-mode add syncs exactly once on reconnect                                      |
| **F5** (P6)    | `/ask` streaming UI over the GenAI endpoint (server-sent events, rendered answer + cited numbers linking to filtered txn views) | Ask "commute vs last quarter?" on the phone, tap a number, land on the filtered ledger |

---

## 12. Long-Term Guardrails

- **Dependency policy:** the intentional list is Next, React, Tailwind, TanStack Query, react-hook-form, zod, Radix primitives, recharts, Serwist, Better Auth client. Anything new must replace ≥50 lines of our code or bring a capability we can't reasonably own. No moment/dayjs (Intl + shared time utils), no lodash, no CSS-in-JS.
- **Upgrade cadence:** Renovate batches minor bumps weekly; Next.js majors get a dedicated branch + full e2e run. Never upgrade Next and React in the same PR as feature work.
- **Deletion-friendly by design:** because features are isolated behind `index.ts`, killing or rewriting one (e.g., replacing the rule-based category chips with the embedding-driven suggester in F5) is a folder-level operation. Measure health by how easy deletion is, not how clever abstractions are.
- **When this app grows** (multi-user, shared household ledgers): the seams are already here — session-scoped everything, feature isolation, URL-driven state. The first real change would be a `households` feature folder, not a rewrite.
- The definition of done from `AGENTS.md` applies unchanged: `pnpm lint && typecheck && test` green, zero type errors, budgets respected. Frontend code is not exempt from the money rules — if you're touching an amount and you're not inside `<Money>` or `AmountInput`, you're in the wrong file.

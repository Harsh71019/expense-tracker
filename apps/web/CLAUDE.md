# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `apps/web` package of the Vyaya monorepo — read the root `/CLAUDE.md` and `/AGENTS.md` first; those rules (money handling, TypeScript strictness, testing gates) apply here too. This file covers only what's specific to the Next.js frontend.

**Note:** the root `CLAUDE.md`'s "Current implementation state" section describes `apps/web` as having only a handful of routes — that's stale. In practice this package already has a full feature-sliced structure covering accounts, transactions, transfers, categories, category rules, assets/net worth, imports, export, quick-add, reports, and profile. Trust what you find under `src/`, not that summary.

## Commands

Run from this directory, or via `pnpm --filter @vyaya/web <script>` from the repo root.

```bash
pnpm dev                     # next dev
pnpm build                   # next build (output: "standalone")
pnpm lint                    # eslint against the shared root config, --max-warnings=0
pnpm typecheck                # tsc --noEmit
pnpm test                    # vitest run --passWithNoTests
pnpm test:coverage            # vitest with coverage; thresholds are 90% stmts/branches/funcs/lines
pnpm test:e2e                 # playwright test (see e2e/ notes below)
```

Single test file: `pnpm --filter @vyaya/web test -- src/features/transactions/model/filters.test.ts`.

`pnpm test:e2e` boots the dev server itself via `playwright.config.ts`'s `webServer` unless `PLAYWRIGHT_BASE_URL` is set, in which case it targets that URL instead (e.g. a full compose stack or deployed preview) and skips spawning a server. Most specs additionally require a live API (Mongo + Redis reachable) and skip themselves if `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` aren't set — see `e2e/login.spec.ts`.

## Architecture

### Rendering & data flow

Server components by default; `"use client"` only where interaction requires it (forms, mutations, anything using TanStack Query hooks). The split is consistent across features:

- **`src/features/<name>/server/*.ts`** — server-only data fetchers, wrapped in React's `cache()`, calling the server API client. Used for the initial SSR render (e.g. a route's `page.tsx` calls `getTxnPage()` to hydrate the first page).
- **`src/features/<name>/hooks/*.ts`** — client-side TanStack Query hooks (`"use client"`), calling the browser API client. These take the server-rendered data as `initialData`/`initialPage` so there's no refetch-on-mount waterfall, then own subsequent pagination/mutation/invalidation.
- **`src/features/<name>/components/*.tsx`** — presentation, composed in route files under `src/app/`.
- **`src/features/<name>/model/*.ts`** — pure functions (zod-backed parsing/serialization of URL search params into typed filters, form-adjacent transforms). No I/O.
- **`src/features/<name>/index.ts`** — the feature's public surface; import from here, not from internal files across feature boundaries.

Two separate `openapi-fetch` clients exist for exactly this client/server split — never mix them up:
- `src/lib/api/client.ts` — browser client, `baseUrl: "/api"`, relies on the Next.js rewrite in `next.config.ts` (`/api/:path*` → `INTERNAL_API_URL`).
- `src/lib/api/server.ts` — server client (RSC/route handlers), calls `INTERNAL_API_URL` directly, forwards the incoming cookie header and a generated `x-request-id`.

Both are generated from the API's OpenAPI schema (`src/lib/api/generated/schema.d.ts`, via `pnpm gen:client` per `AGENTS.md` §6) — never hand-write a `fetch` to the backend. Response payloads are still runtime-validated with the matching zod schema from `@vyaya/shared` before being trusted (see `getTxnPage`, `useTxnList`): a schema mismatch fails closed (empty page / thrown `AppError`), it never passes through unchecked `data`.

### Auth

`src/proxy.ts` (Next.js middleware) redirects unauthenticated requests to `/login?next=<path>`, gated on Better Auth's session cookie — it matches everything except `/login`, `/api`, `/images`, and Next internals. `(app)/layout.tsx` does a second, authoritative check via `getSession()` (`src/lib/api/session.ts`, hits `/auth/get-session` directly, not through the generated client) and redirects server-side if the session is actually invalid — the middleware check is a fast/optimistic gate, not the source of truth. `src/lib/auth/client.ts` wraps `better-auth/react` for client-side sign-in/sign-out flows.

### Errors

API errors are normalized through `src/lib/api/problem.ts::toAppError`, which maps HTTP status + an RFC 7807 problem+json body (validated against `ProblemDetailsSchema` from `@vyaya/shared`) to one of the typed errors in `src/lib/errors.ts` (`AuthError` 401, `ConflictError` 409, `ValidationError` 422 w/ field errors, `NetworkError` 5xx, base `AppError` otherwise). Always route thrown errors through `toAppError`/`toNetworkError` rather than throwing raw fetch/openapi-fetch results — hooks and components pattern-match on error type/name.

### Mutations & idempotency

Mutation hooks that create resources (e.g. `useCreateTxn`) require an idempotency key generated by the caller and sent as the `Idempotency-Key` header — per `AGENTS.md` §6 this is load-bearing (protects against double-submit on flaky mobile connections) and must not be dropped when touching these flows. On settle, mutations invalidate the relevant TanStack Query keys from `src/lib/query/keys.ts` (`qk`) — that file is the single source of truth for query keys; don't inline ad hoc key arrays except where intentionally matching a broader prefix (e.g. `["txns"]` to invalidate all filter variants).

### Money & theme

Never format `amountMinor` by hand — use `<Money>`/`<SignedMoney>` (`src/components/ui/money`) or `formatMinor()` from `@vyaya/shared`, matching the backend's paise-based integer money invariant. Theme (`light`/`dark`) is cookie-backed (`vyaya-theme`, `src/lib/theme*.ts`), read server-side in the root layout to set `data-theme` before hydration, toggled via a server action (`toggleTheme`) — there is no client-side flash-of-unstyled-theme handling needed because it's resolved before first paint.

### Debug logging & Sentry

`src/lib/debug.ts` provides namespaced (`api`/`query`/`offline`/`form`) `console.debug` loggers, active in non-production or when `localStorage["vyaya:debug"] === "1"` — this is the sanctioned logging path (see `docs/frontend/LOGGING-FRONTEND.md`), don't add bare `console.log`. Sentry (GlitchTip-hosted) scrubs ledger contents before they leave the app: `src/lib/sentry-scrub.ts` redacts `amountMinor`/`description`/`password` keys from breadcrumbs and request payloads — if you add a new sensitive field to a form or API payload, add it to `SENSITIVE_KEYS` too.

### Testing conventions

Colocated `__tests__/` (components) or `*.test.ts(x)` next to the file. Route-level smoke tests (`src/app/routes.test.tsx`, `layout.test.tsx`, `app-layout.test.tsx`, `error-boundaries.test.tsx`) assert the App Router tree wires up correctly independent of any single feature. `e2e/` is Playwright-only and excluded from the Vitest run.

### Design/reference docs

`docs/frontend/*.md` (`FRONTEND.md`, `LOGGING-FRONTEND.md`, `PHASE2-UI-GUIDE.md`, etc.) are the target architecture/design docs this package was built against — treat them the same way the root `CLAUDE.md` treats `BACKEND.md`: useful for intent and direction, not a guaranteed description of current code.

# API Key Auth for External Consumers — Design

**Date:** 2026-07-19
**Status:** Approved, ready for implementation planning

## Problem

External automation (e.g. n8n parsing bank/email notifications) needs to call the REST API to create transactions without a browser session. Need long-lived, scoped, revocable credentials distinct from the session-cookie auth used by the web app.

## Use case driving v1 scope

n8n workflow extracts transaction data from emails and creates transactions via the API. Needs: create transactions, read categories (to map extracted merchant/type to a category), read accounts (to map to the right account). Nothing else.

## Architecture

Two auth paths through the same `AuthGuard`: session cookie (existing, unchanged) or `Authorization: Bearer <key>` (new). Key-auth is **opt-in per route** via a `@RequireScopes()` decorator — a route with no decorator rejects key-auth even if the key itself is valid. Key-management endpoints (create/list/revoke) are session-only, so a leaked key can never mint more keys or revoke its siblings.

Built on better-auth's official `apiKey()` plugin (v1.6.23, already in the lockfile) for storage, hashing, expiry, and rate-limit bookkeeping. The plugin does **no route-level enforcement** itself — `verifyApiKey` is a manual check we call from the guard; scope enforcement is entirely our own code on top.

## Data model

New `apikey` table in `apps/api/src/common/db/auth-schema.ts`, hand-authored to mirror the plugin's expected shape, same pattern as the existing `session`/`account` tables (text PK, FK to `user.id` with `onDelete: cascade`, indexed on `userId`).

Expected columns (per better-auth's documented schema): `id`, `name`, `start`, `prefix`, `key` (hashed), `userId`, `enabled`, `permissions` (JSON, shape `{transactions?: string[], categories?: string[], accounts?: string[]}`), `rateLimitEnabled`, `rateLimitTimeWindow`, `rateLimitMax`, `requestCount`, `remaining`, `lastRequest`, `expiresAt`, `createdAt`, `updatedAt`, `metadata`.

**Verify before writing the migration:** run `npx @better-auth/cli generate` against the actually-installed 1.6.23 and reconcile against this list — docs surfaced a newer `configId`/`referenceId` variant that may not match this pinned version. Do not hand-write the migration off unverified docs.

Migration via `drizzle-kit generate`, next number in sequence (`0005_...`), additive-only per AGENTS.md.

## Plugin wiring

`auth.service.ts`: add `apiKey()` plugin to `betterAuth()` config.

- Transport: `Authorization: Bearer <key>` via a `customAPIKeyGetter` that strips the `Bearer ` prefix (the plugin's default header is `x-api-key`; we override it). This reuses the `req.headers.authorization` redact rule already in `app.module.ts`'s pino config — no new redaction needed — and matches the OAuth2-style bearer convention (GitHub PATs, Stripe keys, OpenAI keys all use the same scheme for opaque non-JWT tokens).
- Key prefix: generic, not tied to the app's (currently unlocked) name — e.g. `ak_`. Configurable later if/when the name locks.
- No plugin-level permission schema — `permissions` is validated by our own controller (see below) and stored as opaque JSON by the plugin.
- Default rate limit: 100 req/60s, matching the existing session rate-limit numbers in `auth.service.ts`. Not user-configurable in v1, but the per-key columns already support an override later without a schema change.

## AuthN/AuthZ flow

`AuthGuard.canActivate` extended:

1. `@Public()` → allow (unchanged).
2. `Authorization: Bearer <key>` present → call `auth.api.verifyApiKey({body:{key}})` — **no `permissions` passed in.** The scope check is done ourselves against the returned `key.permissions`, not delegated to the plugin's internal permission-check response: better-auth's docs don't enumerate `verifyApiKey`'s `error.code` values, so a bad-key-vs-missing-scope distinction can't be assumed to exist in a form we can branch on. Doing the comparison in our own code means both the 401 and 403 branches are ours to control and test, regardless of what the plugin does internally.
   - `valid: false` (bad/expired/disabled key) → 401 `UnauthenticatedError` (existing error type, unchanged). Rate-limited is a case of this that needs its own branch — see below.
   - `valid: true` but `key.permissions` doesn't cover the route's `@RequireScopes()` requirement → new 403 `InsufficientScopeError`.
   - Rate limit exceeded → 429 with a `Retry-After` header, **not** 401 — a 401 would read to n8n as "key revoked," causing it to stop retrying instead of backing off. See open risk #4 for how this is detected.
   - Success → `request.authUser = {id: key.userId}`, `request.authMethod = "api-key"`, plus `apiKeyId`/`apiKeyPrefix` set on `LoggingContextService` (extend `LogContext` in `logging-context.service.ts` the same way `userId` is set today) so every log line from an API-key-authenticated request identifies which key was used, for audit.
3. No `Authorization` header → existing session cookie path via `getSession`, unchanged.
4. Route has no `@RequireScopes()` metadata → API-key requests are always rejected (403) regardless of key validity. Key-auth is an allowlist of routes, never a blanket session-equivalent.

New `apps/api/src/auth/require-scopes.decorator.ts`: `@RequireScopes({transactions:["write"]})`, read via `Reflector`, same pattern as the existing `IS_PUBLIC_KEY`/`@Public()`. **`@RequireScopes()` only ever *permits* key-auth on that route with the listed scopes — it never restricts session-cookie users.** A session user hits the route with full access regardless of the decorator; the decorator's only effect is on requests authenticated via `Authorization: Bearer`. Easy to misread as a restriction, so this is the one thing to get right when reading the guard code.

Applied in v1 to exactly three routes: `POST /v1/transactions` (`transactions:write`), `GET /v1/categories` (`categories:read`), `GET /v1/accounts` (`accounts:read`).

## Key management API

New domain module `apps/api/src/api-keys/` — a thin wrapper over better-auth's server API, **not** a Drizzle repository (the plugin owns that table exclusively via its own adapter).

- `POST /v1/api-keys` — body `{name, permissions, expiresAt?}`. `permissions` validated against a shared taxonomy const in `packages/shared` (only the three known resource/action pairs are accepted — zod-enforced, so a request can't ask for a scope that doesn't exist yet). Calls `auth.api.createApiKey({body:{userId, name, permissions, expiresIn, prefix:"ak_"}})`. Response includes the raw key value **once**; it is never persisted, logged, or retrievable again.
- `GET /v1/api-keys` — lists the current user's keys: `id, name, start, permissions, createdAt, expiresAt, lastRequest, enabled`. Never returns `key`/hash.
- `PATCH /v1/api-keys/:id` — body `{name?, permissions?}`, same taxonomy validation as create. Calls `auth.api.updateApiKey({body:{keyId, name, permissions}})`. Edits scopes/name on a live key in place — no key regeneration, no re-pasting into n8n. Safe only because this route (like the others) is session-only; an API key can never elevate its own permissions.
- `DELETE /v1/api-keys/:id` — soft-revoke via `auth.api.updateApiKey({body:{keyId, enabled:false}})` (not a hard delete), preserving the `lastRequest`/`requestCount` audit trail. No un-revoke in the v1 UI. **Verify `updateApiKey` exists on the installed plugin version** — fall back to `deleteApiKey` (hard delete) if not.

All four routes are session-only (no `@RequireScopes` metadata) — an API key can never call these, so a leaked key can't mint more keys, escalate its own scopes, or revoke its siblings.

zod schemas (`CreateApiKeyRequest`, `ApiKeyResponse`, `CreateApiKeyResponse`) live in `packages/shared`, shared with the web client per existing convention.

## Web UI

New feature slice `apps/web/src/features/api-keys/` (`server/hooks/components/model/index.ts`, matching the existing feature-slice convention) plus a route at `src/app/(app)/settings/api-keys/page.tsx`. Added as a new entry in `settingsLinks` on `settings/page.tsx`, using the same card pattern as Accounts/Categories/etc.

Must match existing design language (`border-border bg-surface-elevated` cards, font-mono uppercase accent labels, existing button/table patterns) — check sibling settings pages before styling anything new.

Page contents:
- Table of keys: name, scope chips, created, last used, expiry, edit button (name + scopes, via `PATCH`), revoke button with confirmation.
- "Create key" form: name input, checkboxes for the three known scopes, optional expiry date picker.
- On create, the raw key is shown once in a copy-box with an explicit "won't be shown again" warning, then the user returns to the list.

Uses the existing browser `apiClient` (`openapi-fetch`, generated from the OpenAPI schema). **No `Idempotency-Key` header on the create-key mutation** — unlike `useCreateTxn` et al., this isn't just "replay returns nothing useful." `IdempotencyPostgresService.execute` persists the full response body into the idempotency-records table (`idempotency-postgres.service.ts:41`) so it can replay it later; if create-key's response (which contains the raw secret) went through that path, the plaintext key would sit in a second table indefinitely. Double-submit protection here is client-side only (disable the submit button while the request is pending) — acceptable because, unlike a duplicate transaction, a duplicate key is harmless (delete the extra one). Add `"key"` to `SENSITIVE_KEYS` in `src/lib/sentry-scrub.ts` so the raw key value never leaks into Sentry breadcrumbs.

## Testing

- **Unit:** guard scope-check logic (valid key + correct scope → pass; valid key + wrong scope → 403; expired/disabled key → 401; route without `@RequireScopes` + valid key → 403); `api-keys.service` permission-taxonomy validation rejects unknown scopes.
- **Integration** (`test:integration`, real Postgres via testcontainers): create a key via session, call `POST /v1/transactions` with the key → succeeds; call `POST /v1/api-keys` and `PATCH /v1/api-keys/:id` with the same key → 403 each (key-auth can't manage keys or escalate its own scopes); revoked key → 401; cross-tenant probe (reusing the pattern from AGENTS.md's AuthZ suite) confirms a key from user A can't touch user B's data even with matching scopes, because `userId` comes from the verified key, never the request.
- **OpenAPI:** register an `Authorization: Bearer` security scheme in `registry.ts`, documented on the three scoped routes.

## Open risks to verify at implementation start

1. Exact `apikey` table columns for the installed better-auth 1.6.23 — run `npx @better-auth/cli generate` and reconcile against the column list above before writing the migration.
2. Whether `auth.api.updateApiKey` exists on this plugin version for soft-revoke, or only `deleteApiKey` (hard delete) is available.
3. Exact `customAPIKeyGetter` signature for Bearer-prefix stripping.
4. How `verifyApiKey` signals a rate-limit breach on 1.6.23 — read the plugin source at implementation time. Two fallback designs depending on what's found: (a) if `error.code` (or equivalent) distinguishes rate-limited from not-found/expired/disabled, map it straight to 429 with `Retry-After` computed from the key's `rateLimitTimeWindow` (conservative: full window, since an exact reset timestamp isn't confirmed available); (b) if it doesn't distinguish, do the rate-limit check ourselves in the guard using the `remaining`/`rateLimitMax`/`rateLimitTimeWindow`/`lastRequest` columns off the `key` object `verifyApiKey` returns, instead of trusting the plugin's internal enforcement decision.

## Out of scope for v1

- Per-key rate-limit override in the UI (architecture supports it later; no UI now).
- Un-revoking a disabled key.
- Any role/permission system beyond flat per-key resource:action scopes — no orgs/teams, matches the app's current single-owner-per-account model (BACKEND.md §multi-tenancy).

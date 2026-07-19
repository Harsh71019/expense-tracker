# API Key Auth for External Consumers — Design

**Date:** 2026-07-19
**Status:** Approved, ready for implementation planning

## Problem

External automation (e.g. n8n parsing bank/email notifications) needs to call the REST API to create transactions without a browser session. Need long-lived, scoped, revocable credentials distinct from the session-cookie auth used by the web app.

## Use case driving v1 scope

n8n workflow extracts transaction data from emails and creates transactions via the API. Needs: create transactions, read categories (to map extracted merchant/type to a category), read accounts (to map to the right account). Nothing else.

## Architecture

Two auth paths through the same `AuthGuard`: session cookie (existing, unchanged) or `Authorization: Bearer <key>` (new). Key-auth is **opt-in per route** via a `@RequireScopes()` decorator — a route with no decorator rejects key-auth even if the key itself is valid. Key-management endpoints (create/list/revoke) are session-only, so a leaked key can never mint more keys or revoke its siblings.

Built on `@better-auth/api-key@1.6.23` for storage, hashing, expiry, and rate-limit bookkeeping — **not bundled in the `better-auth` core package**, confirmed by inspecting the installed core's `dist/plugins/` (no `api-key` directory; only `bearer`, which converts a *session* bearer token to a cookie and is unrelated). This is a separate dependency, lockstepped to the same version as core, and must be added to `apps/api/package.json`. Verified against the package's actual shipped type declarations and runtime source (`unpkg.com/@better-auth/api-key@1.6.23/dist/*`), not just its docs site, since the docs site appears to describe a different/newer package shape than what installs at this pinned version.

The plugin's `verifyApiKey` endpoint *does* do its own permission check when given a `permissions` argument, returning a distinguishable `error.code` — no need for a manual scope-comparison workaround (see AuthN/AuthZ flow).

## Data model

New `apikey` table in `apps/api/src/common/db/auth-schema.ts`, hand-authored to mirror the plugin's expected shape, same pattern as the existing `session`/`account` tables — except the owner FK column here is called **`referenceId`** (not `userId` — that's the plugin's naming; keep it as-is rather than fighting the adapter), `text`, FK to `user.id`, `onDelete: cascade`, indexed.

Verified columns (from the package's shipped `ApiKey` type, `types-BR70O3Q3.d.mts`): `id`, `configId` (plugin supports multiple named key-configs; we use exactly one, the implicit `"default"` — never pass `configId` anywhere), `name`, `start`, `prefix`, `key` (hashed), `referenceId`, `refillInterval`, `refillAmount`, `lastRefillAt`, `enabled`, `rateLimitEnabled`, `rateLimitTimeWindow`, `rateLimitMax`, `requestCount`, `remaining`, `lastRequest`, `expiresAt`, `createdAt`, `updatedAt`, `metadata`, `permissions` (`{[resource: string]: string[]} | null` — matches our `{transactions?:["write"], categories?:["read"], accounts?:["read"]}` shape directly).

We don't use the refill/`remaining` credit system (leave `refillInterval`/`refillAmount`/`remaining` unset) — only `rateLimitEnabled`/`rateLimitMax`/`rateLimitTimeWindow` matter for v1.

Migration via `drizzle-kit generate`, next number in sequence (`0005_...`), additive-only per AGENTS.md.

## Plugin wiring

`apps/api/package.json`: add `@better-auth/api-key@1.6.23` (matches installed core version exactly — the package follows lockstep versioning with `better-auth`).

`auth.service.ts`: add `apiKey({...})` to `betterAuth()`'s `plugins` array, called with a single options object (the plugin factory accepts one config or an array; a single object is treated as the implicit `"default"` config — confirmed in source).

- `references: "user"` — `referenceId` maps to `user.id`, not an organization (no orgs/teams in this app).
- No `customAPIKeyGetter`/`apiKeyHeaders` config. Those drive the plugin's own automatic header-sniffing `before` hook, which only runs for requests dispatched through better-auth's own `auth.handler` (the `/api/auth/*` paths). Our domain routes are plain NestJS routes — `AuthGuard` calls `verifyApiKey`/`getSession` as direct library functions, never through `auth.handler`, so that hook never fires here regardless of how it's configured. The guard parses `Authorization: Bearer <key>` itself (one string check, see AuthN/AuthZ flow) — no plugin-level transport config needed at all.
- `enableSessionForAPIKeys`: leave unset/`false`. The plugin *can* auto-convert a valid key into a transparent session via that same hook (so existing `getSession`-based code paths would "just work"), but we deliberately don't use that — we need an explicit branch anyway for scope checks, rate-limit-vs-auth-failure distinction, and audit logging, and folding key-auth invisibly into session resolution would blur exactly the line `@RequireScopes()` depends on. It's also moot for the same reason as above: that hook doesn't run on our routes.
- Key prefix: generic, not tied to the app's (currently unlocked) name — e.g. `ak_` via `defaultPrefix`. Configurable later if/when the name locks.
- No plugin-level static permission schema — `permissions` is validated by our own controller (see below) against a shared taxonomy const, and stored as opaque JSON by the plugin.
- `rateLimit: {enabled: true, timeWindow: 60_000, maxRequests: 100}` — matches the existing session rate-limit numbers in `auth.service.ts` (`window: 60, max: 100`, just in ms here). Not user-configurable in v1, but the per-key columns already support an override later without a schema change.

## AuthN/AuthZ flow

`AuthGuard.canActivate` extended:

1. `@Public()` → allow (unchanged).
2. `Authorization: Bearer <key>` present → call `auth.api.verifyApiKey({body:{key, permissions: requiredScopesFromRouteMetadata}})`, passing the route's `@RequireScopes()` value straight through. The plugin's own permission check returns a distinguishable `error.code` (confirmed in `@better-auth/api-key`'s shipped source, `API_KEY_ERROR_CODES`) — no manual scope-comparison workaround needed. Branch on `error.code`:
   - `RATE_LIMIT_EXCEEDED` → 429 with a `Retry-After` header computed from `error.body.details.tryAgainIn` (milliseconds until the window resets — returned directly by the plugin, confirmed in source; convert to seconds: `Math.ceil(tryAgainIn / 1000)`). **Not** 401 — a 401 would read to n8n as "key revoked," causing it to stop retrying instead of backing off.
   - `INSUFFICIENT_API_KEY_PERMISSIONS` → new 403 `InsufficientScopeError`.
   - Any other failure code (`KEY_NOT_FOUND`, `KEY_DISABLED`, `KEY_EXPIRED`, `INVALID_API_KEY`, etc.) → 401 `UnauthenticatedError` (existing error type, unchanged).
   - Success (`valid: true`) → `request.authUser = {id: key.referenceId}`, `request.authMethod = "api-key"`, plus `apiKeyId`/`apiKeyPrefix` set on `LoggingContextService` (extend `LogContext` in `logging-context.service.ts` the same way `userId` is set today) so every log line from an API-key-authenticated request identifies which key was used, for audit.
   - Note: on every failure branch the plugin returns `key: null` (confirmed in source — it doesn't leak key metadata to a request that failed a check), so there's no `apiKeyId` to log on rejected requests, only on success. That's an acceptable gap — the audit use case ("who created what") only needs the success path.
   - Note: the plugin's runtime source shows two different failure shapes — `RATE_LIMIT_EXCEEDED` is a normal return (`{valid:false, error:{code, details:{tryAgainIn}}, key:null}`), while `INSUFFICIENT_API_KEY_PERMISSIONS` is thrown as an `APIError`. Calling `auth.api.verifyApiKey(...)` as a direct server-side function (not through the HTTP layer) very likely propagates that throw as a catchable JS exception rather than converting it into a return value, matching better-auth's usual direct-call convention — but this is inference from source, not something confirmed by actually invoking it. The guard implementation handles both channels (thrown error and returned `{valid:false, error}`) uniformly rather than assuming one or the other, so it's correct regardless of which one turns out true; the integration test that calls a real key with an out-of-scope permission against a real running instance is what actually settles it.
3. No `Authorization` header → existing session cookie path via `getSession`, unchanged.
4. Route has no `@RequireScopes()` metadata → API-key requests are always rejected (403) regardless of key validity. Key-auth is an allowlist of routes, never a blanket session-equivalent.

New `apps/api/src/auth/require-scopes.decorator.ts`: `@RequireScopes({transactions:["write"]})`, read via `Reflector`, same pattern as the existing `IS_PUBLIC_KEY`/`@Public()`. **`@RequireScopes()` only ever *permits* key-auth on that route with the listed scopes — it never restricts session-cookie users.** A session user hits the route with full access regardless of the decorator; the decorator's only effect is on requests authenticated via `Authorization: Bearer`. Easy to misread as a restriction, so this is the one thing to get right when reading the guard code.

Applied in v1 to exactly three routes: `POST /v1/transactions` (`transactions:write`), `GET /v1/categories` (`categories:read`), `GET /v1/accounts` (`accounts:read`).

## Key management API

New domain module `apps/api/src/api-keys/` — a thin wrapper over better-auth's server API, **not** a Drizzle repository (the plugin owns that table exclusively via its own adapter).

- `POST /v1/api-keys` — body `{name, permissions, expiresAt?}`. `permissions` validated against a shared taxonomy const in `packages/shared` (only the three known resource/action pairs are accepted — zod-enforced, so a request can't ask for a scope that doesn't exist yet). Calls `auth.api.createApiKey({body:{userId, name, permissions, expiresIn, prefix:"ak_"}})`. Response includes the raw key value **once**; it is never persisted, logged, or retrievable again.
- `GET /v1/api-keys` — lists the current user's keys: `id, name, start, permissions, createdAt, expiresAt, lastRequest, enabled`. Never returns `key`/hash.
- `PATCH /v1/api-keys/:id` — body `{name?, permissions?}`, same taxonomy validation as create. Calls `auth.api.updateApiKey({body:{keyId, name, permissions}})`. Edits scopes/name on a live key in place — no key regeneration, no re-pasting into n8n. Safe only because this route (like the others) is session-only; an API key can never elevate its own permissions.
- `DELETE /v1/api-keys/:id` — soft-revoke via `auth.api.updateApiKey({body:{keyId, enabled:false}})` (not a hard delete), preserving the `lastRequest`/`requestCount` audit trail. No un-revoke in the v1 UI. (`updateApiKey` at `POST /api-key/update` confirmed present in `@better-auth/api-key@1.6.23`'s shipped source.)

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
- **Integration** (`test:integration`, real Postgres via testcontainers): create a key via session, call `POST /v1/transactions` with the key → succeeds; call `POST /v1/api-keys` and `PATCH /v1/api-keys/:id` with the same key → 403 each (key-auth can't manage keys or escalate its own scopes); revoked key → 401; cross-tenant probe (reusing the pattern from AGENTS.md's AuthZ suite) confirms a key from user A can't touch user B's data even with matching scopes, because the acting `userId` comes from the verified key's `referenceId`, never the request.
- **OpenAPI:** register an `Authorization: Bearer` security scheme in `registry.ts`, documented on the three scoped routes.

## Resolved risks (previously open, verified against `@better-auth/api-key@1.6.23`'s actual shipped source)

All four items previously listed here as open risks are resolved:

1. `apikey` table columns confirmed from the package's shipped `ApiKey` type (see Data model).
2. `updateApiKey` confirmed present (`POST /api-key/update`).
3. `customAPIKeyGetter` turned out unnecessary — dropped from the design (see Plugin wiring): the plugin's header-sniffing hook never runs on our NestJS routes, so there's nothing to configure. The guard parses `Authorization: Bearer <key>` itself.
4. Rate-limit detection confirmed distinguishable via `error.code === "RATE_LIMIT_EXCEEDED"`, with an exact `tryAgainIn` (ms) value included — no estimation needed.

One remaining fact worth flagging rather than a risk: `@better-auth/api-key` is **not** part of the `better-auth` core package and isn't yet a dependency — must be added to `apps/api/package.json` before anything else in this plan compiles.

## Out of scope for v1

- Per-key rate-limit override in the UI (architecture supports it later; no UI now).
- Un-revoking a disabled key.
- Any role/permission system beyond flat per-key resource:action scopes — no orgs/teams, matches the app's current single-owner-per-account model (BACKEND.md §multi-tenancy).

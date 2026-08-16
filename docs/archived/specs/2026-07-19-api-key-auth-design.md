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

The plugin's `verifyApiKey` endpoint does have its own permission check when given a `permissions` argument, but its failure is indistinguishable from an invalid key (`error.code` is `KEY_NOT_FOUND` for both, confirmed by reading the installed source directly — deliberate on the plugin's part, to avoid giving a probing attacker an oracle for "real key, wrong scope" vs "fake key"). We call `verifyApiKey` without `permissions` and compare `key.permissions` against the route's required scopes ourselves, so a genuine 403 is possible (see AuthN/AuthZ flow).

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
2. `Authorization: Bearer <key>` present → call `auth.api.verifyApiKey({body:{key}})` — **`permissions` deliberately not passed.** Ground truth, read directly from `@better-auth/api-key@1.6.23`'s installed `dist/index.mjs` (not summarized, not inferred — the actual `verifyApiKey`/`validateApiKey`/`consumeRateLimit` source):
   - `verifyApiKey`'s endpoint handler wraps its internal work in a try/catch and **always returns** `{valid, error, key}` to the caller — it never throws. (The earlier design's "handle both a thrown error and a returned value" hedge was solving a problem that doesn't exist; removed.)
   - When `permissions` is passed and the key doesn't have them, the plugin's own check (`validateApiKey`, `if (!role(apiKeyPermissions).authorize(permissions).success) throw APIError.from("UNAUTHORIZED", API_KEY_ERROR_CODES.KEY_NOT_FOUND)`) throws — and gets caught and returned as — `error.code === "KEY_NOT_FOUND"`. **The exact same code as an actually-nonexistent key.** This is deliberate on better-auth's part (an attacker holding a stolen key can't distinguish "wrong key" from "right key, wrong scope" by probing), but it means we cannot use the plugin's built-in permission check to produce a distinct 403 — passing `permissions` into `verifyApiKey` collapses insufficient-scope into indistinguishable-from-invalid-key.
   - So: call `verifyApiKey` with just `{key}` (skips the plugin's internal scope check entirely, but still runs key-validity, expiry, disabled, and rate-limit checks — confirmed in source, the permission block is `if (permissions) {...}`, purely additive), then compare `key.permissions` against the route's required scopes **ourselves**, in guard code.
   - Rate limit: denial is `throw new APIError("TOO_MANY_REQUESTS", {code:"RATE_LIMITED", details:{tryAgainIn}})` inside `consumeRateLimit` (confirmed in source) — caught by the same endpoint-level try/catch, so it also surfaces as a normal return: `error.code === "RATE_LIMITED"` (not `"RATE_LIMIT_EXCEEDED"` — that's a different named entry in `API_KEY_ERROR_CODES`, used only to build the *message* text, not the `code` field). `error.details.tryAgainIn` (ms) is present either way.
   - Branch on the returned `{valid, error, key}`:
     - `error.code === "RATE_LIMITED"` → 429 `RateLimitedError`, `Retry-After` from `Math.ceil(error.details.tryAgainIn / 1000)`. **Not** 401 — a 401 would read to n8n as "key revoked," stopping retries instead of backing off.
     - `!valid || key === null` (covers `KEY_NOT_FOUND`, `KEY_DISABLED`, `KEY_EXPIRED`, `INVALID_API_KEY`) → 401 `UnauthenticatedError`.
     - `valid && key !== null` but `key.permissions` doesn't cover the route's `@RequireScopes()` requirement (checked in our own code, e.g. every required `{resource: [actions]}` entry present as a subset of `key.permissions[resource]`) → 403 `InsufficientScopeError`.
     - `valid && key !== null` and scopes cover the requirement → success: `request.authUser = {id: key.referenceId}`, `request.authMethod = "api-key"`, plus `apiKeyId`/`apiKeyPrefix` set on `LoggingContextService` (extend `LogContext` in `logging-context.service.ts` the same way `userId` is set today) so every log line from an API-key-authenticated request identifies which key was used, for audit.
   - On every failure branch the plugin returns `key: null`, so there's no `apiKeyId` to log on rejected requests, only on success — an acceptable gap, the audit use case ("who created what") only needs the success path.
3. No `Authorization` header → existing session cookie path via `getSession`, unchanged.
4. Route has no `@RequireScopes()` metadata → API-key requests are always rejected (403) regardless of key validity. Key-auth is an allowlist of routes, never a blanket session-equivalent.

New `apps/api/src/auth/require-scopes.decorator.ts`: `@RequireScopes({transactions:["write"]})`, read via `Reflector`, same pattern as the existing `IS_PUBLIC_KEY`/`@Public()`. **`@RequireScopes()` only ever *permits* key-auth on that route with the listed scopes — it never restricts session-cookie users.** A session user hits the route with full access regardless of the decorator; the decorator's only effect is on requests authenticated via `Authorization: Bearer`. Easy to misread as a restriction, so this is the one thing to get right when reading the guard code.

Applied in v1 to exactly three routes: `POST /v1/transactions` (`transactions:write`), `GET /v1/categories` (`categories:read`), `GET /v1/accounts` (`accounts:read`).

## Key management API

New domain module `apps/api/src/api-keys/` — a thin wrapper over better-auth's server API, **not** a Drizzle repository (the plugin owns that table exclusively via its own adapter).

- `POST /v1/api-keys` — body `{name, permissions, expiresAt?}`. `permissions` validated against a shared taxonomy const in `packages/shared` (only the three known resource/action pairs are accepted — zod-enforced, so a request can't ask for a scope that doesn't exist yet). Calls `auth.api.createApiKey({body:{userId, name, permissions, expiresIn, prefix:"ak_"}})` — `userId` comes from `@CurrentUser()`, i.e. our own already-validated session, the same trusted-`userId` invariant used everywhere else in this codebase. Response includes the raw key value **once**; it is never persisted, logged, or retrievable again.
- `GET /v1/api-keys` — lists the current user's keys: `id, name, start, permissions, createdAt, expiresAt, lastRequest, enabled`. Never returns `key`/hash. **Different auth shape than the other three:** confirmed in the plugin's source, `listApiKeys` runs behind `sessionMiddleware` and resolves `session.user.id` itself — it does not accept a server-supplied `userId`. So this one handler takes the raw Express `Request` and forwards `fromNodeHeaders(request.headers)` (the same pattern `AuthGuard` already uses for `getSession`) instead of reading `@CurrentUser()`, letting the plugin re-resolve its own session from the original cookie.
- `PATCH /v1/api-keys/:id` — body `{name?, permissions?}`, same taxonomy validation as create. Calls `auth.api.updateApiKey({body:{keyId, userId, name, permissions}})` (confirmed: `updateApiKey` accepts a server-supplied `userId`, same as create). Edits scopes/name on a live key in place — no key regeneration, no re-pasting into n8n. Safe only because this route (like the others) is session-only; an API key can never elevate its own permissions.
- `DELETE /v1/api-keys/:id` — soft-revoke via `auth.api.updateApiKey({body:{keyId, userId, enabled:false}})` (not `deleteApiKey`, which would require the `Request`-forwarding treatment `list` needs, and not a hard delete either way), preserving the `lastRequest`/`requestCount` audit trail. No un-revoke in the v1 UI.

Cross-tenant safety for all four: `createApiKey`/`updateApiKey` trust the `userId` we pass (our own session-derived `@CurrentUser()`, never client input) but the plugin also independently checks `apiKey.referenceId !== user.id` and throws `KEY_NOT_FOUND` on mismatch — defense in depth on top of, not instead of, the trusted-`userId` boundary. `list` gets its cross-tenant safety from the plugin re-deriving the session itself.

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

This codebase's `test:integration` suite is service-level only (real Postgres via testcontainers, no HTTP layer — confirmed by inspecting `apps/api/test/integration/**`: every existing suite instantiates a service/repository directly against `testDb.db`, none boot the full Nest app with `supertest`). Following that pattern rather than introducing a new HTTP test harness for this feature alone.

- **Unit** (`AuthGuard`, mocked `authService.auth.api.verifyApiKey`): valid key + correct scope → success, sets `authUser`/`authMethod`/logging context; valid key + wrong scope → 403 `InsufficientScopeError`; invalid/expired/disabled key → 401 `UnauthenticatedError`; rate-limited → 429 `RateLimitedError` with `Retry-After` computed from `tryAgainIn`; `Authorization: Bearer` present but route has no `@RequireScopes()` → 403 immediately, without calling `verifyApiKey` at all. Also `ApiKeysController` (mocked `ApiKeysService`, matching `CategoryRuleController`'s test style) and `ApiKeysService` (mocked `AuthService`) for taxonomy validation.
- **Integration** (`test:integration`, real Postgres, real `@better-auth/api-key` plugin — no HTTP layer): construct a real `AuthService` against `testDb.db` the same way `account.service.integration.ts` constructs `AccountService`. Cover: `createApiKey` → `verifyApiKey({body:{key}})` round-trip returns the right `referenceId`/`permissions`; a key created with `{categories:["read"]}` calling `verifyApiKey({body:{key, permissions:{transactions:["write"]}}})` (i.e. exercising the plugin's *own* built-in check, not our guard's manual comparison) returns `error.code === "KEY_NOT_FOUND"` — confirming the plugin really does conflate insufficient-scope with invalid-key, which is exactly why the guard doesn't rely on this path; a rate-limited key's `verifyApiKey` call returns `error.code === "RATE_LIMITED"` with `error.details.tryAgainIn` present; `updateApiKey({enabled:false})` then `verifyApiKey` on the same key → fails; cross-tenant: a key created for `user-a` cannot be updated/revoked by an `ApiKeysService` call made with `user-b`'s id (mirrors `account.service.integration.ts`'s `archives another user's account` case).
- **OpenAPI:** register a `bearerAuth` security scheme in `registry.ts`; the three scoped routes declare `security: [{cookieAuth:[]}, {bearerAuth:[]}]` (either works), the four `/v1/api-keys` routes stay `security: secured` (cookie-only) — the spec doc itself documents the access model correctly this way.

## Resolved risks (previously open, verified against `@better-auth/api-key@1.6.23`'s actual shipped source)

All four items previously listed here as open risks are resolved:

1. `apikey` table columns confirmed from the package's shipped `ApiKey` type (see Data model).
2. `updateApiKey` confirmed present (`POST /api-key/update`).
3. `customAPIKeyGetter` turned out unnecessary — dropped from the design (see Plugin wiring): the plugin's header-sniffing hook never runs on our NestJS routes, so there's nothing to configure. The guard parses `Authorization: Bearer <key>` itself.
4. Rate-limit detection confirmed distinguishable via `error.code === "RATE_LIMITED"` (corrected from an earlier, wrong `"RATE_LIMIT_EXCEEDED"` — that string is a different named entry in the plugin's error-code table, used only for message text), with an exact `tryAgainIn` (ms) value included — no estimation needed.
5. **Correction, found during Task 5's implementation (not during design):** an earlier round of this spec claimed `verifyApiKey`'s built-in permission check returns a distinguishable `INSUFFICIENT_API_KEY_PERMISSIONS` code and that the endpoint sometimes throws rather than returns. Both claims came from a lossy summarized fetch of the package's published source, not a direct read, and were wrong. Reading the actually-installed `node_modules/.../@better-auth/api-key/dist/index.mjs` directly shows: the endpoint never throws to the caller (always returns `{valid, error, key}`); insufficient-scope and invalid-key both surface as `error.code === "KEY_NOT_FOUND"` when `permissions` is passed to `verifyApiKey`. See the corrected AuthN/AuthZ flow section above — the guard now calls `verifyApiKey` without `permissions` and does the scope comparison itself. Lesson: a tool-summarized fetch of a third-party package's source is not equivalent to reading it, for anything load-bearing.

One remaining fact worth flagging rather than a risk: `@better-auth/api-key` is **not** part of the `better-auth` core package and isn't yet a dependency — must be added to `apps/api/package.json` before anything else in this plan compiles.

## Out of scope for v1

- Per-key rate-limit override in the UI (architecture supports it later; no UI now).
- Un-revoking a disabled key.
- Any role/permission system beyond flat per-key resource:action scopes — no orgs/teams, matches the app's current single-owner-per-account model (BACKEND.md §multi-tenancy).

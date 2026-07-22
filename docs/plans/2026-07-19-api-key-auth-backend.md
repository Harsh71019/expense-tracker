# API Key Auth — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let external automation (n8n) authenticate to the REST API with a long-lived, scoped, revocable API key instead of a session cookie, without expanding what a leaked key can reach.

**Architecture:** `AuthGuard` gains a second branch — `Authorization: Bearer <key>` is verified via `@better-auth/api-key`'s `verifyApiKey`, scoped per-route by a new `@RequireScopes()` decorator that is a strict allowlist (routes without it reject key-auth outright, regardless of key validity). A new `/v1/api-keys` module wraps the plugin's server API for key CRUD, session-only. Everything is additive to the existing session-cookie path, which is untouched.

**Tech Stack:** NestJS, `@better-auth/api-key@1.6.23` (new dependency, lockstepped to the installed `better-auth@1.6.23`), Drizzle ORM/`drizzle-kit`, zod (`@vyaya/shared`), Vitest + `@testcontainers/postgresql`.

## Global Constraints

- No `any`, no `as` casts except `as const`, no `!`, no `enum`, no `@ts-ignore` — `pnpm typecheck` must stay clean (AGENTS.md).
- Every repository/service method that touches user data takes `userId` as an explicit first parameter, sourced only from `@CurrentUser()` (session) — never from the request body (AGENTS.md §3, root CLAUDE.md).
- Schema/table changes go through a `drizzle-kit` migration in `apps/api/drizzle/`, never applied by hand.
- `pnpm lint` must pass with `--max-warnings=0`.
- Follow the design in `docs/specs/2026-07-19-api-key-auth-design.md` — this plan implements it task-by-task; if an implementation detail here conflicts with the spec, the spec is the source of truth on intent, this plan is the source of truth on exact code.
- This codebase's `test:integration` suite is service-level only (real Postgres via testcontainers, no HTTP layer) — every task's tests follow that, no new HTTP test harness gets introduced.

---

## Task 1: Add `@better-auth/api-key` dependency and wire the plugin into `auth.service.ts`

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/__tests__/auth.service.test.ts`

**Interfaces:**
- Produces: `AuthService.auth.api.createApiKey`/`verifyApiKey`/`updateApiKey`/`listApiKeys` become available on the existing `AuthService.auth` instance — every later task calls through these.

- [ ] **Step 1: Add the dependency**

Edit `apps/api/package.json`, in the `dependencies` block, add immediately after the existing `"better-auth": "latest",` line:

```json
    "@better-auth/api-key": "latest",
```

(matches the existing convention in this file — every better-auth-family package is pinned to `"latest"`, the lockfile resolves the actual version.)

Run: `pnpm i`
Expected: lockfile updates, resolves `@better-auth/api-key@1.6.23` (matching the installed `better-auth` core version).

- [ ] **Step 2: Write the failing test for plugin wiring**

Open `apps/api/src/auth/__tests__/auth.service.test.ts`. Add a `vi.mock` for the new package right after the existing `vi.mock("../redis-secondary-storage.js", ...)` block (before the `import { AuthService }` line):

```typescript
vi.mock("@better-auth/api-key", () => {
  return {
    apiKey: vi.fn().mockImplementation((options) => ({ id: "api-key", options }))
  };
});
```

Then extend the `betterAuthMockConfig` type at the top of the file to include `plugins`:

```typescript
let betterAuthMockConfig: {
  baseURL?: string;
  emailAndPassword?: { disableSignUp: boolean };
  plugins?: ReadonlyArray<{ id: string; options?: Record<string, unknown> }>;
  databaseHooks?: {
    user?: {
      create?: {
        after?: (user: { id: string; name: string }) => Promise<void>;
      };
    };
  };
} | null = null;
```

Add a new test at the end of the `describe("AuthService", ...)` block, right after the existing `it("instantiates betterAuth with configuration and hooks", ...)` test:

```typescript
  it("registers the apiKey plugin with a user-scoped, database-backed, rate-limited config", async () => {
    const mockDb = {};
    const mockConfig = new MockRuntimeConfigService();
    const mockRedis = {};
    const mockUserProfileService = { ensure: vi.fn().mockResolvedValue(undefined) };
    const mockLogger = { warn: vi.fn() };

    // @ts-expect-error - mock dependencies for unit testing
    new AuthService(mockDb, mockConfig, mockRedis, mockUserProfileService, mockLogger);

    expect(betterAuthMockConfig).not.toBeNull();
    const plugins = betterAuthMockConfig?.plugins ?? [];
    const apiKeyPlugin = plugins.find((plugin) => plugin.id === "api-key");
    expect(apiKeyPlugin).toBeDefined();
    expect(apiKeyPlugin?.options).toMatchObject({
      references: "user",
      requireName: true,
      defaultPrefix: "ak_",
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 100 }
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyaya/api test -- src/auth/__tests__/auth.service.test.ts`
Expected: FAIL — `apiKeyPlugin` is `undefined` (plugin not yet registered), or the mock module doesn't match yet.

- [ ] **Step 3: Wire the plugin**

Edit `apps/api/src/auth/auth.service.ts`. Add the import right after the existing `import { drizzleAdapter } from "better-auth/adapters/drizzle";` line:

```typescript
import { apiKey } from "@better-auth/api-key";
```

Inside `createAuth(...)`, add a `plugins` array to the `betterAuth({...})` config object, as a new top-level key (place it after `rateLimit: {...}` and before the closing `});`):

```typescript
    plugins: [
      apiKey({
        references: "user",
        requireName: true,
        defaultPrefix: "ak_",
        keyExpiration: { defaultExpiresIn: null },
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 100 }
      })
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyaya/api test -- src/auth/__tests__/auth.service.test.ts`
Expected: PASS (both the pre-existing test and the new one).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @vyaya/api typecheck`
Expected: no errors. If `apiKey(...)`'s options type rejects any of the fields above, fix the call to match the real type (the type surface was confirmed via the package's shipped `.d.mts`, but a small drift is possible — trust the compiler here over this plan).

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/auth/auth.service.ts apps/api/src/auth/__tests__/auth.service.test.ts
git commit -m "feat(auth): wire @better-auth/api-key plugin into betterAuth config"
```

---

## Task 2: Add the `apikey` table and generate its migration

**Files:**
- Modify: `apps/api/src/common/db/auth-schema.ts`
- Create: `apps/api/drizzle/0005_<generated-name>.sql` (generated, not hand-written)
- Create: `apps/api/drizzle/meta/0005_snapshot.json` (generated)
- Modify: `apps/api/drizzle/meta/_journal.json` (generated)

**Interfaces:**
- Produces: `apikey` Drizzle table (`apps/api/src/common/db/auth-schema.ts`'s `apikey` export) — Task 11's integration tests query this table indirectly through the plugin; nothing else references it directly since the plugin's adapter owns all reads/writes to it.

- [ ] **Step 1: Add the table to `auth-schema.ts`**

Edit `apps/api/src/common/db/auth-schema.ts`. Change the top import line from:

```typescript
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
```

to:

```typescript
import { pgTable, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
```

Add the new table after the existing `verification` table (before `export const userRelations = ...`):

```typescript
export const apikey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    referenceId: text("reference_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: boolean("enabled").default(true).notNull(),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true).notNull(),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").default(0).notNull(),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    permissions: text("permissions"),
    metadata: text("metadata")
  },
  (table) => [index("apikey_reference_id_idx").on(table.referenceId)]
);
```

(Column set matches `@better-auth/api-key@1.6.23`'s shipped `ApiKey` type exactly — verified against the package's `.d.mts`, not guessed. `permissions`/`metadata` are `text`, matching how this file already stores structured-ish better-auth fields like `account.scope` as plain text rather than jsonb — the plugin does its own JSON (de)serialization.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @vyaya/api migrate:generate`
Expected: creates `apps/api/drizzle/0005_<name>.sql` and `apps/api/drizzle/meta/0005_snapshot.json`, updates `apps/api/drizzle/meta/_journal.json`.

- [ ] **Step 3: Inspect the generated migration**

Open the new `apps/api/drizzle/0005_*.sql`. Confirm it contains exactly one `CREATE TABLE "apikey" (...)` with all 21 columns from Step 1, a foreign key on `reference_id` to `"user"("id")` with `ON DELETE CASCADE`, and a `CREATE INDEX "apikey_reference_id_idx"`. If anything is missing or the FK/index looks wrong, fix the schema in Step 1 and regenerate (delete the generated `0005_*` files first, `drizzle-kit generate` is not idempotent-safe to re-run over a half-edited migration).

- [ ] **Step 4: Verify migrations are consistent**

Run: `pnpm verify:migrations`
Expected: passes (from repo root).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/db/auth-schema.ts apps/api/drizzle/0005_*.sql apps/api/drizzle/meta/
git commit -m "feat(db): add apikey table migration for @better-auth/api-key"
```

---

## Task 3: New error types for scope/rate-limit failures, wired through the RFC 7807 filter

**Files:**
- Modify: `packages/shared/src/errors/codes.ts`
- Modify: `apps/api/src/common/errors/domain-error.ts`
- Create: `apps/api/src/common/errors/insufficient-scope.error.ts`
- Create: `apps/api/src/common/errors/rate-limited.error.ts`
- Modify: `apps/api/src/common/errors/problem-json.filter.ts`
- Create: `apps/api/src/common/errors/__tests__/insufficient-scope.error.test.ts`
- Create: `apps/api/src/common/errors/__tests__/rate-limited.error.test.ts`
- Modify: `apps/api/src/common/errors/__tests__/problem-json.filter.test.ts`

**Interfaces:**
- Consumes: `DomainError` base class (`apps/api/src/common/errors/domain-error.ts`).
- Produces: `InsufficientScopeError` (403, `auth.insufficient_scope`), `RateLimitedError(retryAfterSeconds: number)` (429, `auth.rate_limited`, sets a `Retry-After` response header) — Task 5's `AuthGuard` throws these directly.

- [ ] **Step 1: Add the two new error codes**

Edit `packages/shared/src/errors/codes.ts`. Add two entries to the `ErrorCodes` array, right after `"auth.unauthenticated",`:

```typescript
  "auth.unauthenticated",
  "auth.insufficient_scope",
  "auth.rate_limited",
```

- [ ] **Step 2: Write the failing tests for the two new error classes**

Create `apps/api/src/common/errors/__tests__/insufficient-scope.error.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { InsufficientScopeError } from "../insufficient-scope.error.js";

describe("InsufficientScopeError", () => {
  it("is a 403, non-retryable domain error", () => {
    const error = new InsufficientScopeError();
    expect(error.code).toBe("auth.insufficient_scope");
    expect(error.status).toBe(403);
    expect(error.retryable).toBe(false);
    expect(error.headers).toBeUndefined();
  });
});
```

Create `apps/api/src/common/errors/__tests__/rate-limited.error.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { RateLimitedError } from "../rate-limited.error.js";

describe("RateLimitedError", () => {
  it("is a 429, retryable domain error carrying a Retry-After header", () => {
    const error = new RateLimitedError(42);
    expect(error.code).toBe("auth.rate_limited");
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.headers).toEqual({ "Retry-After": "42" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyaya/api test -- src/common/errors/__tests__/insufficient-scope.error.test.ts src/common/errors/__tests__/rate-limited.error.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Add the optional `headers` field to `DomainError`**

Edit `apps/api/src/common/errors/domain-error.ts`, add one line to the abstract class body, after `abstract readonly retryable: boolean;`:

```typescript
  readonly headers?: Readonly<Record<string, string>>;
```

- [ ] **Step 4: Create the two error classes**

Create `apps/api/src/common/errors/insufficient-scope.error.ts`:

```typescript
import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class InsufficientScopeError extends DomainError {
  readonly code = "auth.insufficient_scope";
  readonly status = HttpStatus.FORBIDDEN;
  readonly retryable = false;

  constructor() {
    super("This API key does not have the required scope for this action.");
  }
}
```

Create `apps/api/src/common/errors/rate-limited.error.ts`:

```typescript
import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class RateLimitedError extends DomainError {
  readonly code = "auth.rate_limited";
  readonly status = HttpStatus.TOO_MANY_REQUESTS;
  readonly retryable = true;
  readonly headers: Readonly<Record<string, string>>;

  constructor(retryAfterSeconds: number) {
    super("API key rate limit exceeded.");
    this.headers = { "Retry-After": String(retryAfterSeconds) };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @vyaya/api test -- src/common/errors/__tests__/insufficient-scope.error.test.ts src/common/errors/__tests__/rate-limited.error.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for header propagation in the filter**

Open `apps/api/src/common/errors/__tests__/problem-json.filter.test.ts` and check its existing structure first (read the file — it will show the exact mock shape for `ArgumentsHost`/`Response` already in use in this codebase; match that shape exactly rather than inventing a new one). Add a new test to its `describe` block:

```typescript
  it("applies headers from a DomainError that carries them", () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
      set: vi.fn(),
      getHeader: vi.fn().mockReturnValue("req-1")
    };
    const request = { originalUrl: "/v1/transactions" };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response
      })
    };
    const logger = { error: vi.fn() };
    const filter = new ProblemJsonFilter(
      // @ts-expect-error - mock Logger for unit testing
      logger
    );

    // @ts-expect-error - mock ArgumentsHost for unit testing
    filter.catch(new RateLimitedError(30), host);

    expect(response.set).toHaveBeenCalledWith({ "Retry-After": "30" });
    expect(response.status).toHaveBeenCalledWith(429);
  });
```

Add the import at the top of the file:

```typescript
import { RateLimitedError } from "../rate-limited.error.js";
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @vyaya/api test -- src/common/errors/__tests__/problem-json.filter.test.ts`
Expected: FAIL — `response.set` never called (filter doesn't apply headers yet).

- [ ] **Step 7: Apply headers in the filter**

Edit `apps/api/src/common/errors/problem-json.filter.ts`. In the `catch(...)` method, insert this block after the `if (!isExpectedException(exception)) {...}` block and before the final `response.status(problem.status)...` line:

```typescript
    if (exception instanceof DomainError && exception.headers !== undefined) {
      response.set(exception.headers);
    }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @vyaya/api test -- src/common/errors/__tests__/problem-json.filter.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint`
Expected: clean.

```bash
git add packages/shared/src/errors/codes.ts apps/api/src/common/errors/domain-error.ts apps/api/src/common/errors/insufficient-scope.error.ts apps/api/src/common/errors/rate-limited.error.ts apps/api/src/common/errors/problem-json.filter.ts apps/api/src/common/errors/__tests__/insufficient-scope.error.test.ts apps/api/src/common/errors/__tests__/rate-limited.error.test.ts apps/api/src/common/errors/__tests__/problem-json.filter.test.ts
git commit -m "feat(errors): add InsufficientScopeError and RateLimitedError, header propagation in RFC7807 filter"
```

---

## Task 4: `@RequireScopes()` decorator, `authMethod` on the request, `apiKeyId`/`apiKeyPrefix` on the log context

**Files:**
- Create: `apps/api/src/auth/require-scopes.decorator.ts`
- Modify: `apps/api/src/auth/express.d.ts`
- Modify: `apps/api/src/common/logging/logging-context.service.ts`
- Create: `apps/api/src/auth/__tests__/require-scopes.decorator.test.ts`

**Interfaces:**
- Produces: `RequireScopes(scopes: ApiKeyScopes)` decorator + `REQUIRE_SCOPES_KEY` metadata key + `ApiKeyScopes` type (`Readonly<Record<string, readonly string[]>>`) — Task 5's guard reads this metadata; Task 9 applies the decorator to routes.
- Produces: `Request.authMethod?: "session" | "api-key"` — Task 5 sets it.
- Produces: `LogContext.apiKeyId?: string` / `LogContext.apiKeyPrefix?: string` — Task 5 sets these via `LoggingContextService.set(...)`.

- [ ] **Step 1: Write the failing test for the decorator**

Create `apps/api/src/auth/__tests__/require-scopes.decorator.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";

import { RequireScopes, REQUIRE_SCOPES_KEY } from "../require-scopes.decorator.js";

describe("RequireScopes", () => {
  it("attaches the given scopes as route metadata under REQUIRE_SCOPES_KEY", () => {
    class Target {
      @RequireScopes({ transactions: ["write"] })
      handler(): void {
        return undefined;
      }
    }

    const reflector = new Reflector();
    const scopes = reflector.get(REQUIRE_SCOPES_KEY, new Target().handler);
    expect(scopes).toEqual({ transactions: ["write"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyaya/api test -- src/auth/__tests__/require-scopes.decorator.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the decorator**

Create `apps/api/src/auth/require-scopes.decorator.ts`:

```typescript
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_SCOPES_KEY = "requireScopes";

export type ApiKeyScopes = Readonly<Record<string, readonly string[]>>;

export const RequireScopes = (scopes: ApiKeyScopes): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_SCOPES_KEY, scopes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyaya/api test -- src/auth/__tests__/require-scopes.decorator.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the request type**

Edit `apps/api/src/auth/express.d.ts`. Change:

```typescript
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}
```

to:

```typescript
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authMethod?: "session" | "api-key";
    }
  }
}
```

- [ ] **Step 6: Extend `LogContext`**

Edit `apps/api/src/common/logging/logging-context.service.ts`. Change:

```typescript
export type LogContext = Readonly<{
  reqId: string;
  userId?: string;
  jobId?: string;
  jobName?: string;
  batchId?: string;
  txnId?: string;
  traceId?: string;
}>;
```

to:

```typescript
export type LogContext = Readonly<{
  reqId: string;
  userId?: string;
  jobId?: string;
  jobName?: string;
  batchId?: string;
  txnId?: string;
  traceId?: string;
  apiKeyId?: string;
  apiKeyPrefix?: string;
}>;
```

- [ ] **Step 7: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint`
Expected: clean (these are additive/optional fields, nothing else should break).

```bash
git add apps/api/src/auth/require-scopes.decorator.ts apps/api/src/auth/express.d.ts apps/api/src/common/logging/logging-context.service.ts apps/api/src/auth/__tests__/require-scopes.decorator.test.ts
git commit -m "feat(auth): add RequireScopes decorator, authMethod field, apiKeyId/apiKeyPrefix log context"
```

---

## Task 5: Extend `AuthGuard` with the API-key authentication branch

**Files:**
- Modify: `apps/api/src/auth/auth.guard.ts`
- Modify: `apps/api/src/auth/__tests__/auth.guard.test.ts`

**Interfaces:**
- Consumes: `REQUIRE_SCOPES_KEY`/`ApiKeyScopes` (Task 4), `InsufficientScopeError`/`RateLimitedError` (Task 3), `authMethod`/`LogContext.apiKeyId`/`apiKeyPrefix` (Task 4), `authService.auth.api.verifyApiKey` (Task 1).
- Produces: on a successful key-auth request, `request.authUser = {id: <referenceId>}`, `request.authMethod = "api-key"` — Task 9's scoped routes and every downstream `@CurrentUser()` consumer rely on `authUser` being set identically regardless of which branch set it.

**Corrected after this task was first implemented and reviewed** — the original version of this section (based on a summarized web fetch of the package's source, not a direct read) claimed `verifyApiKey` sometimes throws and that its built-in permission check returns a distinguishable `INSUFFICIENT_API_KEY_PERMISSIONS` code. Both were wrong. Reading the actually-installed `node_modules/.../@better-auth/api-key/dist/index.mjs` directly (ground truth, not a summary) shows:

- `verifyApiKey`'s endpoint handler wraps everything in try/catch and **always returns** `{valid, error, key}` — it never throws to the caller. No dual-channel handling needed.
- If `permissions` is passed to `verifyApiKey` and the key doesn't have them, the plugin's own check throws — internally — `APIError.from("UNAUTHORIZED", API_KEY_ERROR_CODES.KEY_NOT_FOUND)`, which the endpoint's try/catch turns into `error.code === "KEY_NOT_FOUND"`. **The exact same code as an actually-invalid key.** This is deliberate (denies a probing attacker an oracle for "real key, wrong scope" vs "fake key"), but it means passing `permissions` into `verifyApiKey` cannot produce a distinct 403 — the guard below calls `verifyApiKey` with just `{key}` (skips the plugin's internal scope check, but still runs validity/expiry/disabled/rate-limit checks — those aren't gated on `permissions` being present) and compares `key.permissions` against the route's required scopes itself.
- Rate limit denial's real code is `"RATE_LIMITED"` (confirmed in `consumeRateLimit`'s `throw new APIError("TOO_MANY_REQUESTS", {code:"RATE_LIMITED", details:{tryAgainIn}})`), not `"RATE_LIMIT_EXCEEDED"` — that's a different named entry in the plugin's error-code table, used only to build the *message* text. It's also caught by the same endpoint-level try/catch, so it surfaces as a normal return like everything else.

This task is still the plan's highest-risk one — it's the guard gating every route in this API — but the risk is now "did we read the source correctly and implement the comparison right," not "which of two behaviors will a live call exhibit." Task 11's integration test (real plugin, real Postgres) still exercises this for real, including the specific claim that passing `permissions` to `verifyApiKey` produces `KEY_NOT_FOUND` rather than a scope-specific code — that assertion is what would have caught this mistake before it shipped, had it run first.

- [ ] **Step 1: Write the failing tests**

Open `apps/api/src/auth/__tests__/auth.guard.test.ts`. Add these imports at the top, alongside the existing ones:

```typescript
import { InsufficientScopeError } from "../../common/errors/insufficient-scope.error.js";
import { RateLimitedError } from "../../common/errors/rate-limited.error.js";
```

Add these tests inside the existing `describe("AuthGuard", ...)` block, after the last existing test:

```typescript
  it("authenticates via a valid Bearer API key whose permissions cover the required scope", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi.fn().mockResolvedValue({
            valid: true,
            error: null,
            key: {
              id: "key-1",
              referenceId: "user-1",
              prefix: "ak_",
              permissions: { transactions: ["write"], categories: ["read"] }
            }
          })
        }
      }
    };
    const mockLoggingContext = { set: vi.fn() };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      mockLoggingContext
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(mockRequest).toMatchObject({ authUser: { id: "user-1" }, authMethod: "api-key" });
    // `permissions` is deliberately NOT passed to verifyApiKey -- the plugin's own
    // permission check would collapse insufficient-scope into the same error.code as
    // an invalid key (KEY_NOT_FOUND, confirmed by reading the installed source). The
    // guard fetches the key's permissions and compares them itself, below.
    expect(mockAuthService.auth.api.verifyApiKey).toHaveBeenCalledWith({
      body: { key: "ak_test123" }
    });
    expect(mockLoggingContext.set).toHaveBeenCalledWith({
      userId: "user-1",
      apiKeyId: "key-1",
      apiKeyPrefix: "ak_"
    });
  });

  it("rejects a Bearer key on a route with no RequireScopes metadata, without calling verifyApiKey", async () => {
    const mockReflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const mockAuthService = { auth: { api: { verifyApiKey: vi.fn() } } };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(InsufficientScopeError);
    expect(mockAuthService.auth.api.verifyApiKey).not.toHaveBeenCalled();
  });

  it("throws InsufficientScopeError when a valid key's permissions don't cover the required scope", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi.fn().mockResolvedValue({
            valid: true,
            error: null,
            key: {
              id: "key-1",
              referenceId: "user-1",
              prefix: "ak_",
              permissions: { categories: ["read"] }
            }
          })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(InsufficientScopeError);
  });

  it("throws RateLimitedError with Retry-After derived from tryAgainIn", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi.fn().mockResolvedValue({
            valid: false,
            error: { code: "RATE_LIMITED", details: { tryAgainIn: 30_500 } },
            key: null
          })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    const error: unknown = await guard.canActivate(mockContext).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).headers).toEqual({ "Retry-After": "31" });
  });

  it("throws UnauthenticatedError for an invalid/expired/disabled key", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi
            .fn()
            .mockResolvedValue({ valid: false, error: { code: "KEY_NOT_FOUND" }, key: null })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthenticatedError);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyaya/api test -- src/auth/__tests__/auth.guard.test.ts`
Expected: FAIL — current guard has no Bearer-header branch at all, so every new test fails (falls through to the session/`getSession` path and throws or behaves differently).

- [ ] **Step 3: Rewrite the guard**

Replace the full contents of `apps/api/src/auth/auth.guard.ts` with:

```typescript
import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { REQUIRE_SCOPES_KEY } from "./require-scopes.decorator.js";
import type { ApiKeyScopes } from "./require-scopes.decorator.js";
import { InsufficientScopeError } from "../common/errors/insufficient-scope.error.js";
import { RateLimitedError } from "../common/errors/rate-limited.error.js";
import { UnauthenticatedError } from "../common/errors/unauthenticated.error.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { UserProfileService } from "../user-profiles/user-profile.service.js";

export type AuthenticatedUser = Readonly<{ id: string }>;

type VerifiedApiKey = Readonly<{
  id: string;
  referenceId: string;
  prefix: string | null;
  permissions: Readonly<Record<string, readonly string[]>> | null;
}>;

type VerifyApiKeyResult = Readonly<{
  valid: boolean;
  error: Readonly<{ code?: string; details?: Readonly<{ tryAgainIn?: number }> }> | null;
  key: VerifiedApiKey | null;
}>;

const DEFAULT_RETRY_AFTER_MS = 60_000;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly profiles: UserProfileService,
    private readonly reflector: Reflector,
    private readonly loggingContext: LoggingContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const bearerKey = extractBearerKey(request.headers.authorization);

    if (bearerKey !== undefined) {
      const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScopes | undefined>(
        REQUIRE_SCOPES_KEY,
        [context.getHandler(), context.getClass()]
      );
      if (requiredScopes === undefined) {
        throw new InsufficientScopeError();
      }
      await this.authenticateApiKey(bearerKey, requiredScopes, request);
      return true;
    }

    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers)
    });

    if (session === null) {
      throw new UnauthenticatedError();
    }

    await this.profiles.ensure(session.user.id, session.user.name);
    this.loggingContext.set({ userId: session.user.id });
    request.authUser = { id: session.user.id };
    request.authMethod = "session";
    return true;
  }

  private async authenticateApiKey(
    key: string,
    requiredScopes: ApiKeyScopes,
    request: Request
  ): Promise<void> {
    // `permissions` is deliberately NOT passed to verifyApiKey -- the plugin's own
    // permission check (confirmed in its installed source) throws the exact same
    // error.code, KEY_NOT_FOUND, whether the key is invalid or merely under-scoped,
    // by design (denies a probing attacker an oracle for "real key, wrong scope" vs
    // "fake key"). We check basic validity here, then compare the key's own
    // `permissions` against the route's required scopes ourselves, below, so an
    // under-scoped-but-real key gets a genuine 403 instead of an indistinguishable 401.
    const result = (await this.authService.auth.api.verifyApiKey({
      body: { key }
    })) as VerifyApiKeyResult;

    if (result.error?.code === "RATE_LIMITED") {
      const tryAgainInMs = result.error.details?.tryAgainIn ?? DEFAULT_RETRY_AFTER_MS;
      throw new RateLimitedError(Math.ceil(tryAgainInMs / 1000));
    }
    if (!result.valid || result.key === null) {
      throw new UnauthenticatedError();
    }
    if (!hasRequiredScopes(result.key.permissions, requiredScopes)) {
      throw new InsufficientScopeError();
    }

    request.authUser = { id: result.key.referenceId };
    request.authMethod = "api-key";
    this.loggingContext.set({
      userId: result.key.referenceId,
      apiKeyId: result.key.id,
      ...(result.key.prefix === null ? {} : { apiKeyPrefix: result.key.prefix })
    });
  }
}

function extractBearerKey(header: string | undefined): string | undefined {
  if (header === undefined || !header.startsWith("Bearer ")) return undefined;
  const key = header.slice("Bearer ".length).trim();
  return key.length > 0 ? key : undefined;
}

function hasRequiredScopes(
  granted: Readonly<Record<string, readonly string[]>> | null,
  required: ApiKeyScopes
): boolean {
  if (granted === null) return false;
  return Object.entries(required).every(([resource, actions]) =>
    actions.every((action) => granted[resource]?.includes(action) === true)
  );
}
```

Note: the pre-existing test `"authenticates and ensures profile for valid session"` asserted `mockLoggingContext.set` was called with `{userId: "user-1"}` — that's unchanged (the session branch still calls `.set({userId: ...})` only). Its assertion on `mockRequest.authUser` also still holds; it doesn't assert on `authMethod`, so adding `request.authMethod = "session"` doesn't break it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyaya/api test -- src/auth/__tests__/auth.guard.test.ts`
Expected: PASS — all 8 tests (3 pre-existing + 5 new) green.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint`
Expected: clean. If `verifyApiKey`'s real return type doesn't structurally match `VerifyApiKeyResult` (e.g. the `as VerifyApiKeyResult` cast is flagged, or the `key.permissions` shape differs), adjust `VerifyApiKeyResult`/the call to match what the compiler reports — this file is the one place in the plan where the real installed type takes precedence over what's written here. Note that this repo's ESLint config bans `as` assertions entirely (`@typescript-eslint/consistent-type-assertions` with `assertionStyle: "never"`) — if the cast gets flagged, replace it with a runtime-validating parse (e.g. a small structural check function) or `instanceof`/typeof narrowing rather than reintroducing `as`.

```bash
git add apps/api/src/auth/auth.guard.ts apps/api/src/auth/__tests__/auth.guard.test.ts
git commit -m "feat(auth): add API-key Bearer authentication branch to AuthGuard"
```

---

## Task 6: Shared zod schemas and permission taxonomy in `packages/shared`

**Files:**
- Create: `packages/shared/src/api-key.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/api-key.test.ts`

**Interfaces:**
- Produces: `ApiKeyPermissionsSchema`, `CreateApiKeySchema`, `UpdateApiKeySchema`, `ApiKeySchema`, `CreateApiKeyResponseSchema`, `ApiKeyIdSchema`, and types `ApiKeyPermissions`, `CreateApiKey`, `UpdateApiKey`, `ApiKey`, `CreateApiKeyResponse`, `ApiKeyId` — Task 7/8 (backend controller/service) and the frontend plan both import these from `@vyaya/shared`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/api-key.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { ApiKeyPermissionsSchema, CreateApiKeySchema } from "./api-key.js";

describe("ApiKeyPermissionsSchema", () => {
  it("accepts a permissions object using only known resource/action pairs", () => {
    const result = ApiKeyPermissionsSchema.safeParse({
      transactions: ["write"],
      categories: ["read"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown action for a known resource", () => {
    const result = ApiKeyPermissionsSchema.safeParse({ transactions: ["delete"] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty permissions object", () => {
    const result = ApiKeyPermissionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("CreateApiKeySchema", () => {
  it("requires a non-empty name and at least one scope", () => {
    const result = CreateApiKeySchema.safeParse({
      name: "n8n",
      permissions: { transactions: ["write"] }
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = CreateApiKeySchema.safeParse({ permissions: { transactions: ["write"] } });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyaya/shared test -- src/api-key.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the schema file**

Create `packages/shared/src/api-key.ts`:

```typescript
import { z } from "zod";

export const ApiKeyPermissionsSchema = z
  .object({
    transactions: z.array(z.enum(["write"])).optional(),
    categories: z.array(z.enum(["read"])).optional(),
    accounts: z.array(z.enum(["read"])).optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Select at least one scope.");

export const ApiKeyIdSchema = z.string().min(1);

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  permissions: ApiKeyPermissionsSchema,
  expiresAt: z.coerce.date().optional()
});

export const UpdateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  permissions: ApiKeyPermissionsSchema.optional()
});

export const ApiKeySchema = z.object({
  id: ApiKeyIdSchema,
  name: z.string(),
  start: z.string().nullable(),
  permissions: ApiKeyPermissionsSchema.nullable(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
  lastRequest: z.coerce.date().nullable()
});

export const CreateApiKeyResponseSchema = ApiKeySchema.extend({
  key: z.string()
});

export type ApiKeyPermissions = z.infer<typeof ApiKeyPermissionsSchema>;
export type ApiKeyId = z.infer<typeof ApiKeyIdSchema>;
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
export type UpdateApiKey = z.infer<typeof UpdateApiKeySchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyaya/shared test -- src/api-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

Edit `packages/shared/src/index.ts`. Add, alphabetically alongside the other exports (right after the `account.js` export block is a fine spot since `api-key` sorts right after `account`):

```typescript
export {
  ApiKeyIdSchema,
  ApiKeyPermissionsSchema,
  ApiKeySchema,
  CreateApiKeyResponseSchema,
  CreateApiKeySchema,
  UpdateApiKeySchema
} from "./api-key.js";
export type {
  ApiKey,
  ApiKeyId,
  ApiKeyPermissions,
  CreateApiKey,
  CreateApiKeyResponse,
  UpdateApiKey
} from "./api-key.js";
```

- [ ] **Step 6: Typecheck, lint, build, commit**

Run: `pnpm --filter @vyaya/shared typecheck && pnpm --filter @vyaya/shared lint && pnpm --filter @vyaya/shared build`
Expected: clean (the `build` step matters here — `apps/api` and `apps/web` both consume the built output, not the source, for cross-package imports in this monorepo's TS project references setup).

```bash
git add packages/shared/src/api-key.ts packages/shared/src/api-key.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add API key zod schemas and permission taxonomy"
```

---

## Task 7: `ApiKeysService`

**Files:**
- Create: `apps/api/src/api-keys/api-keys.service.ts`
- Create: `apps/api/src/api-keys/__tests__/api-keys.service.test.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 1), `CreateApiKey`/`UpdateApiKey`/`ApiKey`/`CreateApiKeyResponse` types (Task 6).
- Produces: `ApiKeysService.create(userId, input)`, `.list(request)`, `.update(userId, keyId, input)`, `.revoke(userId, keyId)` — Task 8's controller calls these directly.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/api-keys/__tests__/api-keys.service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { ApiKeysService } from "../api-keys.service.js";

function pluginKey(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "key-1",
    name: "n8n",
    start: "ak_ab",
    permissions: { transactions: ["write"] },
    enabled: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    lastRequest: null,
    ...overrides
  };
}

describe("ApiKeysService", () => {
  it("creates a key, passing the caller's userId and the raw permissions through", async () => {
    const mockAuthService = {
      auth: { api: { createApiKey: vi.fn().mockResolvedValue({ ...pluginKey(), key: "ak_secret" }) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);

    const result = await service.create("user-1", {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });

    expect(mockAuthService.auth.api.createApiKey).toHaveBeenCalledWith({
      body: {
        userId: "user-1",
        name: "n8n",
        permissions: { transactions: ["write"] },
        prefix: "ak_"
      }
    });
    expect(result).toMatchObject({ id: "key-1", key: "ak_secret" });
  });

  it("converts an expiresAt date into expiresIn seconds for createApiKey", async () => {
    const mockAuthService = {
      auth: { api: { createApiKey: vi.fn().mockResolvedValue({ ...pluginKey(), key: "ak_secret" }) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);
    const expiresAt = new Date(Date.now() + 3_600_000);

    await service.create("user-1", { name: "n8n", permissions: { accounts: ["read"] }, expiresAt });

    const call = mockAuthService.auth.api.createApiKey.mock.calls[0]?.[0] as {
      body: { expiresIn?: number };
    };
    expect(call.body.expiresIn).toBeGreaterThan(3_500);
    expect(call.body.expiresIn).toBeLessThanOrEqual(3_600);
  });

  it("lists keys by forwarding the request's headers, not a userId", async () => {
    const mockAuthService = {
      auth: { api: { listApiKeys: vi.fn().mockResolvedValue({ apiKeys: [pluginKey()] }) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);
    const mockRequest = { headers: { cookie: "better-auth.session_token=abc" } };

    // @ts-expect-error - mock Express Request for unit testing
    const result = await service.list(mockRequest);

    expect(mockAuthService.auth.api.listApiKeys).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(result).toEqual([
      expect.objectContaining({ id: "key-1", name: "n8n", start: "ak_ab" })
    ]);
  });

  it("updates a key, scoping by the caller's userId", async () => {
    const mockAuthService = {
      auth: { api: { updateApiKey: vi.fn().mockResolvedValue(pluginKey({ name: "renamed" })) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);

    const result = await service.update("user-1", "key-1", { name: "renamed" });

    expect(mockAuthService.auth.api.updateApiKey).toHaveBeenCalledWith({
      body: { keyId: "key-1", userId: "user-1", name: "renamed" }
    });
    expect(result.name).toBe("renamed");
  });

  it("revokes a key by disabling it via updateApiKey, scoped by userId", async () => {
    const mockAuthService = {
      auth: { api: { updateApiKey: vi.fn().mockResolvedValue(pluginKey({ enabled: false })) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);

    await service.revoke("user-1", "key-1");

    expect(mockAuthService.auth.api.updateApiKey).toHaveBeenCalledWith({
      body: { keyId: "key-1", userId: "user-1", enabled: false }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyaya/api test -- src/api-keys/__tests__/api-keys.service.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the service**

Create `apps/api/src/api-keys/api-keys.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { ApiKey, CreateApiKey, CreateApiKeyResponse, UpdateApiKey } from "@vyaya/shared";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service.js";

type PluginApiKey = Readonly<{
  id: string;
  name: string | null;
  start: string | null;
  permissions: Record<string, string[]> | null;
  enabled: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  lastRequest: Date | null;
}>;

@Injectable()
export class ApiKeysService {
  constructor(private readonly authService: AuthService) {}

  async create(userId: string, input: CreateApiKey): Promise<CreateApiKeyResponse> {
    const created = (await this.authService.auth.api.createApiKey({
      body: {
        userId,
        name: input.name,
        permissions: input.permissions,
        prefix: "ak_",
        ...(input.expiresAt === undefined ? {} : { expiresIn: secondsUntil(input.expiresAt) })
      }
    })) as PluginApiKey & { key: string };

    return { ...toApiKey(created), key: created.key };
  }

  async list(request: Request): Promise<ApiKey[]> {
    const { apiKeys } = (await this.authService.auth.api.listApiKeys({
      headers: fromNodeHeaders(request.headers)
    })) as { apiKeys: PluginApiKey[] };
    return apiKeys.map(toApiKey);
  }

  async update(userId: string, keyId: string, input: UpdateApiKey): Promise<ApiKey> {
    const updated = (await this.authService.auth.api.updateApiKey({
      body: { keyId, userId, ...input }
    })) as PluginApiKey;
    return toApiKey(updated);
  }

  async revoke(userId: string, keyId: string): Promise<void> {
    await this.authService.auth.api.updateApiKey({
      body: { keyId, userId, enabled: false }
    });
  }
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.floor((date.getTime() - Date.now()) / 1000));
}

function toApiKey(key: PluginApiKey): ApiKey {
  return {
    id: key.id,
    name: key.name ?? "",
    start: key.start,
    permissions: key.permissions,
    enabled: key.enabled,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    lastRequest: key.lastRequest
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyaya/api test -- src/api-keys/__tests__/api-keys.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint`
Expected: clean. If `createApiKey`/`updateApiKey`/`listApiKeys`'s real parameter types don't structurally accept the calls above (e.g. `headers` isn't a valid option on `listApiKeys`), adjust the call to match what the compiler reports — same rule as Task 5's guard, the installed type wins over this plan.

```bash
git add apps/api/src/api-keys/api-keys.service.ts apps/api/src/api-keys/__tests__/api-keys.service.test.ts
git commit -m "feat(api-keys): add ApiKeysService wrapping better-auth's api-key plugin"
```

---

## Task 8: `ApiKeysController` + `ApiKeysModule`, wired into `AppModule`

**Files:**
- Create: `apps/api/src/api-keys/api-keys.controller.ts`
- Create: `apps/api/src/api-keys/api-keys.module.ts`
- Create: `apps/api/src/api-keys/__tests__/api-keys.controller.test.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ApiKeysService` (Task 7), `CreateApiKeySchema`/`UpdateApiKeySchema`/`ApiKeyIdSchema` (Task 6), `CurrentUser`/`AuthenticatedUser` (existing).
- Produces: `POST /v1/api-keys`, `GET /v1/api-keys`, `PATCH /v1/api-keys/:keyId`, `DELETE /v1/api-keys/:keyId` — none carry `@RequireScopes()`, so per Task 5's guard they reject API-key auth outright; only session cookies reach them.

- [ ] **Step 1: Write the failing controller tests**

Create `apps/api/src/api-keys/__tests__/api-keys.controller.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { ApiKeysController } from "../api-keys.controller.js";

const user: AuthenticatedUser = { id: "user-1" };

const sampleKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date(),
  expiresAt: null,
  lastRequest: null
};

describe("ApiKeysController", () => {
  it("creates a key from a validated body", async () => {
    const mockService = { create: vi.fn().mockResolvedValue({ ...sampleKey, key: "ak_secret" }) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    const result = await controller.create(user, {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });

    expect(result).toMatchObject({ id: "key-1", key: "ak_secret" });
    expect(mockService.create).toHaveBeenCalledWith("user-1", {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });
  });

  it("rejects a create body with an unknown scope before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    await expect(
      controller.create(user, { name: "n8n", permissions: { transactions: ["delete"] } })
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("lists keys by forwarding the raw request", async () => {
    const mockService = { list: vi.fn().mockResolvedValue([sampleKey]) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);
    const mockRequest = { headers: {} };

    // @ts-expect-error - mock Express Request for unit testing
    expect(await controller.list(mockRequest)).toEqual([sampleKey]);
    expect(mockService.list).toHaveBeenCalledWith(mockRequest);
  });

  it("updates a key by validated id and body", async () => {
    const mockService = { update: vi.fn().mockResolvedValue({ ...sampleKey, name: "renamed" }) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    const result = await controller.update(user, "key-1", { name: "renamed" });

    expect(result.name).toBe("renamed");
    expect(mockService.update).toHaveBeenCalledWith("user-1", "key-1", { name: "renamed" });
  });

  it("revokes a key by validated id", async () => {
    const mockService = { revoke: vi.fn().mockResolvedValue(undefined) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    await controller.revoke(user, "key-1");
    expect(mockService.revoke).toHaveBeenCalledWith("user-1", "key-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyaya/api test -- src/api-keys/__tests__/api-keys.controller.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the controller**

Create `apps/api/src/api-keys/api-keys.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import {
  ApiKeyIdSchema,
  CreateApiKeySchema,
  UpdateApiKeySchema,
  type ApiKey,
  type CreateApiKeyResponse
} from "@vyaya/shared";
import type { Request } from "express";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ApiKeysService } from "./api-keys.service.js";

@Controller("v1/api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown
  ): Promise<CreateApiKeyResponse> {
    return this.apiKeys.create(user.id, CreateApiKeySchema.parse(body));
  }

  // listApiKeys requires a real better-auth session and resolves session.user.id
  // itself -- it doesn't accept a server-supplied userId the way the other three
  // plugin calls do. Forward the raw request so the plugin re-derives its own
  // session from the original cookie, instead of using @CurrentUser().
  @Get()
  list(@Req() request: Request): Promise<ApiKey[]> {
    return this.apiKeys.list(request);
  }

  @Patch(":keyId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("keyId") keyId: string,
    @Body() body: unknown
  ): Promise<ApiKey> {
    return this.apiKeys.update(user.id, ApiKeyIdSchema.parse(keyId), UpdateApiKeySchema.parse(body));
  }

  @Delete(":keyId")
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("keyId") keyId: string
  ): Promise<void> {
    return this.apiKeys.revoke(user.id, ApiKeyIdSchema.parse(keyId));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyaya/api test -- src/api-keys/__tests__/api-keys.controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the module and wire it into `AppModule`**

Create `apps/api/src/api-keys/api-keys.module.ts`:

```typescript
import { Module } from "@nestjs/common";

import { ApiKeysController } from "./api-keys.controller.js";
import { ApiKeysService } from "./api-keys.service.js";

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService]
})
export class ApiKeysModule {}
```

Edit `apps/api/src/app.module.ts`. Add the import alongside the other module imports (after `import { AccountsModule } from "./accounts/accounts.module.js";`):

```typescript
import { ApiKeysModule } from "./api-keys/api-keys.module.js";
```

Add `ApiKeysModule` to the `imports` array, alongside `AccountsModule`:

```typescript
    AccountsModule,
    ApiKeysModule,
```

- [ ] **Step 6: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint`
Expected: clean.

```bash
git add apps/api/src/api-keys/api-keys.controller.ts apps/api/src/api-keys/api-keys.module.ts apps/api/src/api-keys/__tests__/api-keys.controller.test.ts apps/api/src/app.module.ts
git commit -m "feat(api-keys): add ApiKeysController and module, wire into AppModule"
```

---

## Task 9: Apply `@RequireScopes()` to the three routes n8n needs

**Files:**
- Modify: `apps/api/src/transactions/transaction.controller.ts`
- Modify: `apps/api/src/categories/category.controller.ts`
- Modify: `apps/api/src/accounts/account.controller.ts`
- Modify: `apps/api/src/transactions/__tests__/transaction.controller.test.ts` (or wherever its existing test lives — check the file before editing; if none exists at that path, search `apps/api/src/transactions/__tests__/` for the actual name first)
- Modify: `apps/api/src/categories/__tests__/category.controller.test.ts`
- Modify: `apps/api/src/accounts/__tests__/account.controller.test.ts`

**Interfaces:**
- Consumes: `RequireScopes` (Task 4). No new interfaces produced — this task only adds metadata to existing handlers, the guard (Task 5) already knows how to read it.

- [ ] **Step 1: Add the decorator to `TransactionController.create`**

Edit `apps/api/src/transactions/transaction.controller.ts`. Add the import alongside the other auth imports:

```typescript
import { RequireScopes } from "../auth/require-scopes.decorator.js";
```

Add the decorator directly above the existing `@Post()` on the `create` method:

```typescript
  @Post()
  @RequireScopes({ transactions: ["write"] })
  async create(
```

- [ ] **Step 2: Add the decorator to `CategoryController.list`**

Edit `apps/api/src/categories/category.controller.ts`. Add the import:

```typescript
import { RequireScopes } from "../auth/require-scopes.decorator.js";
```

Add the decorator above `@Get()` on `list`:

```typescript
  @Get()
  @RequireScopes({ categories: ["read"] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Category[]> {
```

- [ ] **Step 3: Add the decorator to `AccountController.list`**

Edit `apps/api/src/accounts/account.controller.ts`. Add the import:

```typescript
import { RequireScopes } from "../auth/require-scopes.decorator.js";
```

Add the decorator above `@Get()` on `list`:

```typescript
  @Get()
  @RequireScopes({ accounts: ["read"] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Account[]> {
```

- [ ] **Step 4: Confirm existing controller tests still pass unmodified**

A `@SetMetadata`-based decorator on a method doesn't change its runtime behavior when the method is called directly (as these controllers' existing unit tests do — they instantiate the controller and call `.create(...)`/`.list(...)` directly, bypassing Nest's DI/guard pipeline entirely). No test changes should be required.

Run: `pnpm --filter @vyaya/api test -- src/transactions src/categories src/accounts`
Expected: PASS, unchanged.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint`
Expected: clean.

```bash
git add apps/api/src/transactions/transaction.controller.ts apps/api/src/categories/category.controller.ts apps/api/src/accounts/account.controller.ts
git commit -m "feat(api-keys): apply RequireScopes to transaction create, category list, account list"
```

---

## Task 10: OpenAPI registration

**Files:**
- Modify: `apps/api/src/openapi/registry.ts`

**Interfaces:**
- Consumes: `ApiKeySchema`/`CreateApiKeySchema`/`UpdateApiKeySchema`/`CreateApiKeyResponseSchema` (Task 6).
- No interfaces produced for later tasks — this is documentation/schema-generation only, but it does gate the frontend plan's typed client generation (`pnpm gen:client` reads this).

- [ ] **Step 1: Register the `bearerAuth` security scheme**

Edit `apps/api/src/openapi/registry.ts`. Add, right after the existing `registry.registerComponent("securitySchemes", "cookieAuth", {...})` block:

```typescript
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer"
});
```

- [ ] **Step 2: Add a `securedByKeyOrCookie` helper and apply it to the three scoped routes**

Add, right after the existing `const secured = [{ cookieAuth: [] }];` line:

```typescript
const securedByKeyOrCookie = [{ cookieAuth: [] }, { bearerAuth: [] }];
```

Find the `registerPath` call for `POST /v1/transactions` and change its `security: secured` to `security: securedByKeyOrCookie`. Do the same for `GET /v1/categories` and `GET /v1/accounts`. (Locate each by searching for `path: "/v1/transactions"` with `method: "post"`, `path: "/v1/categories"` with `method: "get"`, `path: "/v1/accounts"` with `method: "get"` respectively — leave every other route's `security: secured` untouched.)

- [ ] **Step 3: Import the api-keys schemas**

Add to the existing `import {...} from "@vyaya/shared";` block at the top of the file (insert alphabetically among the existing named imports):

```typescript
  ApiKeySchema,
  CreateApiKeyResponseSchema,
  CreateApiKeySchema,
  UpdateApiKeySchema,
```

- [ ] **Step 4: Register the four `/v1/api-keys` paths**

Add, after the last existing `registerPath` call in the file:

```typescript
registry.registerPath({
  method: "post",
  path: "/v1/api-keys",
  security: secured,
  request: { body: json(CreateApiKeySchema) },
  responses: {
    201: { description: "Created API key (raw key shown once)", ...json(CreateApiKeyResponseSchema) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/api-keys",
  security: secured,
  responses: { 200: { description: "API keys", ...json(z.array(ApiKeySchema)) }, ...problemResponses }
});
registry.registerPath({
  method: "patch",
  path: "/v1/api-keys/{keyId}",
  security: secured,
  request: { params: z.object({ keyId: z.string() }), body: json(UpdateApiKeySchema) },
  responses: { 200: { description: "Updated API key", ...json(ApiKeySchema) }, ...problemResponses }
});
registry.registerPath({
  method: "delete",
  path: "/v1/api-keys/{keyId}",
  security: secured,
  request: { params: z.object({ keyId: z.string() }) },
  responses: { 204: { description: "API key revoked" }, ...problemResponses }
});
```

- [ ] **Step 5: Regenerate the OpenAPI spec and typed client, verify it compiles**

Run: `pnpm gen:client`
Expected: regenerates `apps/api/openapi.json` and `apps/web/src/lib/api/generated/schema.d.ts` without error.

Run: `pnpm --filter @vyaya/api typecheck && pnpm --filter @vyaya/api lint && pnpm --filter @vyaya/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/openapi/registry.ts apps/api/openapi.json apps/web/src/lib/api/generated/schema.d.ts
git commit -m "feat(openapi): register bearerAuth scheme and /v1/api-keys paths"
```

---

## Task 11: Integration tests against the real plugin

**Files:**
- Create: `apps/api/test/integration/api-keys/api-keys.integration.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 1), `ApiKeysService` (Task 7), `createTestDb`/`insertTestUser` (existing test support).

- [ ] **Step 1: Write the integration test file**

Create `apps/api/test/integration/api-keys/api-keys.integration.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiKeysService } from "../../../src/api-keys/api-keys.service.js";
import { AuthService } from "../../../src/auth/auth.service.js";
import type { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

class TestRuntimeConfigService implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "api" as const,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "test-sha",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false
  };

  trustedOrigins(): string[] {
    return ["http://localhost:3000"];
  }
}

describe("api-key plugin integration", () => {
  let testDb: TestDb;
  let authService: AuthService;
  let apiKeys: ApiKeysService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");

    // @ts-expect-error - mock RedisService/UserProfileService/Logger for integration testing;
    // the api-key plugin defaults to database storage, never touches secondaryStorage
    authService = new AuthService(testDb.db, new TestRuntimeConfigService(), {}, { ensure: async () => {} }, {
      warn: () => undefined
    });
    apiKeys = new ApiKeysService(authService);
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("round-trips create -> verify with matching permissions", async () => {
    const created = await apiKeys.create("user-a", {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { transactions: ["write"] } }
    });

    expect(verified.valid).toBe(true);
    expect(verified.key?.referenceId).toBe("user-a");
  });

  it("verifyApiKey's own permission check collapses insufficient-scope into KEY_NOT_FOUND, same as an invalid key -- this is why AuthGuard (Task 5) never passes permissions to verifyApiKey and compares scopes itself", async () => {
    const created = await apiKeys.create("user-a", {
      name: "read-only",
      permissions: { categories: ["read"] }
    });

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { transactions: ["write"] } }
    });

    expect(verified.valid).toBe(false);
    expect(verified.error?.code).toBe("KEY_NOT_FOUND");
  });

  it("a rate-limited key's verifyApiKey call returns RATE_LIMITED with a positive tryAgainIn", async () => {
    const created = await authService.auth.api.createApiKey({
      body: {
        userId: "user-a",
        name: "rate-limited",
        permissions: { accounts: ["read"] },
        prefix: "ak_",
        rateLimitEnabled: true,
        rateLimitMax: 1,
        rateLimitTimeWindow: 60_000
      }
    });

    const first = await authService.auth.api.verifyApiKey({ body: { key: created.key } });
    expect(first.valid).toBe(true);

    const second = await authService.auth.api.verifyApiKey({ body: { key: created.key } });
    expect(second.valid).toBe(false);
    expect(second.error?.code).toBe("RATE_LIMITED");
    expect(second.error?.details?.tryAgainIn).toBeGreaterThan(0);
  });

  it("a revoked (disabled) key fails verification", async () => {
    const created = await apiKeys.create("user-a", {
      name: "to-revoke",
      permissions: { accounts: ["read"] }
    });

    await apiKeys.revoke("user-a", created.id);

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { accounts: ["read"] } }
    });
    expect(verified.valid).toBe(false);
  });

  it("cannot update or revoke another user's key", async () => {
    const created = await apiKeys.create("user-a", {
      name: "user-a-key",
      permissions: { accounts: ["read"] }
    });

    await expect(
      apiKeys.update("user-b", created.id, { name: "hijacked" })
    ).rejects.toThrow();
    await expect(apiKeys.revoke("user-b", created.id)).rejects.toThrow();

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { accounts: ["read"] } }
    });
    expect(verified.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @vyaya/api test:integration -- test/integration/api-keys/api-keys.integration.ts`
Expected: PASS, all five tests green. This requires Docker (testcontainers spins up a real Postgres) — if it fails on container startup rather than an assertion, that's an environment issue, not a code issue.

If the `KEY_NOT_FOUND` collapse test fails with a different `error.code`, the plugin's behavior has changed from what Task 5 was built against (possible on a future `@better-auth/api-key` version bump) — this is a real signal to re-examine `AuthGuard.authenticateApiKey` (Task 5), not something to paper over by changing the assertion to match.

If the fourth test's `apiKeys.update("user-b", ...)` doesn't throw (i.e., cross-tenant update silently succeeds instead of failing), that means the plugin's `apiKey.referenceId !== user.id` ownership check didn't fire as expected — stop and re-examine `ApiKeysService.update`/`revoke` in Task 7 before proceeding; this would be a real cross-tenant vulnerability, not a minor test adjustment.

- [ ] **Step 3: Run the full backend verification suite**

Run (from repo root): `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm verify:migrations && pnpm build`
Expected: all clean — this is the same sequence CI runs, per root `CLAUDE.md`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/integration/api-keys/api-keys.integration.ts
git commit -m "test(api-keys): integration tests against the real plugin"
```

---

## Self-Review Notes

**Spec coverage:** every section of `docs/specs/2026-07-19-api-key-auth-design.md` maps to a task — Data model → Task 2, Plugin wiring → Task 1, AuthN/AuthZ flow → Tasks 4+5, Key management API → Tasks 6-8, applying scopes → Task 9, OpenAPI → Task 10, Testing → Task 11 (plus unit tests folded into each task). Web UI is out of scope for this plan by design (separate frontend plan).

**Type consistency:** `ApiKeyScopes` (Task 4) is the exact same shape consumed by `@RequireScopes()` (Task 9) and read by `AuthGuard` (Task 5). `ApiKey`/`CreateApiKey`/`UpdateApiKey`/`CreateApiKeyResponse` (Task 6) are the exact types `ApiKeysService` (Task 7) returns and `ApiKeysController` (Task 8) is typed against — no renaming drift between tasks.

**No placeholders:** every step has literal code, not a description of code. The two spots that explicitly defer to the compiler/a real test run rather than asserting a guessed shape (Task 5 Step 5, Task 7 Step 5) are flagged as such deliberately, matching the spec's own "resolved risks" section — they're not TBDs, they're "verify against the real installed type, here's what to do if it differs."

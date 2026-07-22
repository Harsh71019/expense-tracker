# Stoplight Elements Integration — Implementation Guide

> **Purpose**: Add interactive API documentation to the NestJS backend using [Stoplight Elements](https://github.com/stoplightio/elements) web components, served directly from `apps/api`. This document is self-contained — an AI agent can execute it top-to-bottom without additional context.

---

## 1. What We're Building

Two new unauthenticated endpoints on the NestJS API:

| Route                   | Returns                                                                                                       | Purpose                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `GET /api/openapi.json` | `application/json` — the live OpenAPI 3.1 spec                                                                | Consumed by Stoplight Elements (and by `pnpm gen:client`) |
| `GET /api/docs`         | `text/html` — a self-contained page that loads the Stoplight Elements `<elements-api>` web component from CDN | Interactive API docs UI (schemas + endpoints + Try It)    |

Both routes are **public** (no auth required) — they use the existing `@Public()` decorator pattern from [public.decorator.ts](file:///Users/harsh/Developer/Expense-Tracker/apps/api/src/auth/public.decorator.ts), exactly like the health endpoints.

No new npm dependencies are added. Stoplight Elements is loaded entirely from the unpkg CDN via `<script>` and `<link>` tags in the served HTML.

---

## 2. Existing Codebase Context

### OpenAPI Spec Generation (already exists)

The OpenAPI spec is already fully defined:

- **Registry**: [apps/api/src/openapi/registry.ts](file:///Users/harsh/Developer/Expense-Tracker/apps/api/src/openapi/registry.ts) — uses `@asteasolutions/zod-to-openapi` `OpenAPIRegistry` to register all paths (accounts, categories, transactions, transfers) with zod schemas from `@treasury-ops/shared`.
- **Generator script**: [apps/api/scripts/generate-openapi.ts](file:///Users/harsh/Developer/Expense-Tracker/apps/api/scripts/generate-openapi.ts) — uses `OpenApiGeneratorV31` to produce a full document and writes it to `apps/api/openapi.json` (1,375 lines, ~35KB).
- **Root script**: `pnpm gen:client` calls `pnpm --filter @treasury-ops/api gen:openapi` first, then generates the typed client for `apps/web`.

The new controller will reuse the exact same `registry` and `OpenApiGeneratorV31` to generate the spec at runtime — no file reads, no static JSON serving.

### Auth Pattern

All controllers are behind a global `AuthGuard`. Public routes opt out via the `@Public()` class/method decorator which sets `isPublic` metadata. Reference: [health.controller.ts](file:///Users/harsh/Developer/Expense-Tracker/apps/api/src/health/health.controller.ts).

### Helmet CSP

[main.ts](file:///Users/harsh/Developer/Expense-Tracker/apps/api/src/main.ts) calls `app.use(helmet())` with zero config (all defaults). The default CSP blocks external scripts and styles, which will prevent the CDN-loaded Stoplight Elements from rendering. We need to relax CSP **only for the `/api/docs` route**.

### Global Prefix

`app.setGlobalPrefix("api")` is set in `main.ts`, so a controller route `"docs"` becomes `/api/docs` and `"openapi.json"` becomes `/api/openapi.json`.

---

## 3. Files to Create

### 3.1 `apps/api/src/openapi/openapi.controller.ts` [NEW]

```typescript
import { Controller, Get, Header, Res } from "@nestjs/common";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import type { Response } from "express";

import { Public } from "../auth/public.decorator.js";
import { registry } from "./registry.js";

/**
 * Serves the live OpenAPI specification and an interactive documentation
 * UI powered by Stoplight Elements. Both endpoints are public — no
 * session required — matching the pattern used by HealthController.
 */
@Controller()
@Public()
export class OpenApiController {
  /**
   * Returns the OpenAPI 3.1 JSON document, generated at request time
   * from the zod-to-openapi registry. This is the same generation
   * logic as `scripts/generate-openapi.ts`, kept in sync automatically
   * because both import the same `registry` singleton.
   */
  @Get("openapi.json")
  getSpec(): ReturnType<OpenApiGeneratorV31["generateDocument"]> {
    const generator = new OpenApiGeneratorV31(registry.definitions);
    return generator.generateDocument({
      openapi: "3.1.0",
      info: {
        title: "TreasuryOps API",
        version: "1.0.0",
        description:
          "Personal expense tracker with an append-only, double-entry-style ledger. " +
          "All money values are integer paise (amountMinor). The ledger is immutable — " +
          "corrections are compensating reversal entries, never updates or deletes."
      },
      servers: [{ url: "/api" }],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token"
          }
        }
      }
    });
  }

  /**
   * Serves a self-contained HTML page that loads the Stoplight Elements
   * `<elements-api>` web component from the unpkg CDN. The component
   * fetches `/api/openapi.json` (the sibling endpoint above) on load.
   *
   * We use `@Res({ passthrough: true })` only to set CSP headers that
   * are more permissive than the global Helmet defaults — specifically
   * allowing scripts/styles from unpkg.com. The response body is still
   * returned via NestJS (not `res.send()`), preserving interceptor
   * compatibility.
   */
  @Get("docs")
  @Header("Content-Type", "text/html")
  getDocs(@Res({ passthrough: true }) res: Response): string {
    // Override the global Helmet CSP for this single route to allow
    // Stoplight Elements assets from unpkg.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://unpkg.com",
        "font-src 'self' data: https://unpkg.com",
        "img-src 'self' data: blob: https://unpkg.com",
        "connect-src 'self'",
        "worker-src blob:"
      ].join("; ")
    );

    return DOCS_HTML;
  }
}

/**
 * Static HTML template for the Stoplight Elements documentation page.
 * Kept as a const to avoid re-building the string on every request.
 *
 * Configuration choices:
 * - `router="hash"` — prevents the SPA router from conflicting with
 *   NestJS route matching. All navigation happens after the `#`.
 * - `layout="sidebar"` — three-column "Stripe-style" layout with a
 *   sidebar table of contents, main content, and try-it panel.
 * - `tryItCredentialsPolicy="include"` — sends cookies with Try It
 *   requests so authenticated endpoints work out of the box.
 * - `hideExport="true"` — hides the "Export" button (the spec is
 *   already available at /api/openapi.json).
 */
const DOCS_HTML = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>TreasuryOps API Documentation</title>

    <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css" />
    <script src="https://unpkg.com/@stoplight/elements/web-components.min.js" defer></script>

    <style>
      /* Reset body so Elements fills the viewport */
      html, body { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
    </style>
  </head>
  <body>
    <elements-api
      apiDescriptionUrl="/api/openapi.json"
      router="hash"
      layout="sidebar"
      tryItCredentialsPolicy="include"
      hideExport="true"
    />
  </body>
</html>`;
```

### 3.2 `apps/api/src/openapi/openapi.module.ts` [NEW]

```typescript
import { Module } from "@nestjs/common";

import { OpenApiController } from "./openapi.controller.js";

@Module({
  controllers: [OpenApiController]
})
export class OpenApiModule {}
```

---

## 4. Files to Modify

### 4.1 `apps/api/src/app.module.ts` [MODIFY]

Add `OpenApiModule` to the imports array.

```diff
 import { ImportsModule } from "./imports/imports.module.js";
+import { OpenApiModule } from "./openapi/openapi.module.js";
 import { UserProfilesModule } from "./user-profiles/user-profiles.module.js";
 import { TransactionsModule } from "./transactions/transactions.module.js";
```

```diff
     AssetsModule,
     ImportsModule,
+    OpenApiModule,
     LoggerModule.forRootAsync({
```

### 4.2 `apps/api/src/main.ts` [MODIFY]

**No changes needed.** The per-route CSP override in `OpenApiController.getDocs()` uses `res.setHeader("Content-Security-Policy", ...)` which overwrites Helmet's CSP header for that single response. The global `helmet()` call with defaults remains untouched for all other routes, preserving the existing security posture.

---

## 5. Files to Create — Tests

### 5.1 `apps/api/src/openapi/__tests__/openapi.controller.test.ts` [NEW]

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";

import { OpenApiController } from "../openapi.controller.js";

describe("OpenApiController", () => {
  let controller: OpenApiController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OpenApiController]
    }).compile();
    controller = module.get(OpenApiController);
  });

  describe("GET /openapi.json", () => {
    it("returns a valid OpenAPI 3.1 document", () => {
      const spec = controller.getSpec();
      expect(spec).toHaveProperty("openapi", "3.1.0");
      expect(spec).toHaveProperty("info.title", "TreasuryOps API");
      expect(spec).toHaveProperty("paths");
      expect(spec).toHaveProperty("components.schemas");
      expect(spec).toHaveProperty("components.securitySchemes.cookieAuth");
    });

    it("includes registered paths for core resources", () => {
      const spec = controller.getSpec();
      const paths = Object.keys(spec.paths ?? {});
      expect(paths).toContain("/v1/accounts");
      expect(paths).toContain("/v1/categories");
      expect(paths).toContain("/v1/transactions");
    });
  });

  describe("GET /docs", () => {
    it("returns HTML containing the Stoplight Elements web component", () => {
      const fakeRes = { setHeader: vi.fn() } as never;
      const html = controller.getDocs(fakeRes);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("<elements-api");
      expect(html).toContain('apiDescriptionUrl="/api/openapi.json"');
      expect(html).toContain("@stoplight/elements/styles.min.css");
      expect(html).toContain("@stoplight/elements/web-components.min.js");
    });

    it("sets a permissive CSP header allowing unpkg.com", () => {
      const setHeader = vi.fn();
      const fakeRes = { setHeader } as never;
      controller.getDocs(fakeRes);
      expect(setHeader).toHaveBeenCalledWith(
        "Content-Security-Policy",
        expect.stringContaining("https://unpkg.com")
      );
    });
  });
});
```

---

## 6. What NOT to Change

| File                          | Why                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `main.ts` Helmet config       | The per-route CSP override handles it. No global weakening.                                           |
| `package.json` (api or root)  | No new npm deps. Stoplight Elements loads from CDN.                                                   |
| `openapi/registry.ts`         | Unchanged — the controller imports and reuses it.                                                     |
| `scripts/generate-openapi.ts` | Unchanged — still used by `pnpm gen:client`. The controller generates the same document at runtime.   |
| `nginx.conf`                  | `/api/docs` and `/api/openapi.json` already route to the API via the existing `/api/` location block. |

---

## 7. Execution Checklist

```
1. [ ] Create apps/api/src/openapi/openapi.controller.ts        (§3.1)
2. [ ] Create apps/api/src/openapi/openapi.module.ts             (§3.2)
3. [ ] Modify apps/api/src/app.module.ts — add OpenApiModule     (§4.1)
4. [ ] Create apps/api/src/openapi/__tests__/openapi.controller.test.ts (§5.1)
5. [ ] Run: pnpm typecheck                                       (must pass, zero errors)
6. [ ] Run: pnpm lint                                             (must pass, zero warnings)
7. [ ] Run: pnpm test                                             (all unit tests pass)
8. [ ] Run: pnpm test:integration                                 (all integration tests pass)
9. [ ] Run: pnpm dev                                              (start dev server)
10.[ ] Verify: GET http://localhost:4000/api/openapi.json          (valid JSON, 200)
11.[ ] Verify: GET http://localhost:4000/api/docs                  (Elements UI renders, no console errors)
```

---

## 8. Architecture Notes

### Why CDN instead of `npm install @stoplight/elements`?

1. **Zero dependency addition** — `AGENTS.md` §9 says "Do not add dependencies casually." Stoplight Elements is a ~2MB browser bundle with 100+ transitive deps. The CDN `<script>` tag sidesteps all of that — no `node_modules` bloat, no supply-chain surface, no build-time cost.
2. **Web component, not React** — the API is NestJS/Express, not a React app. The `<elements-api>` web component is the canonical integration path for non-React projects per Stoplight's own documentation.
3. **The HTML page is 100% self-contained** — it's a string literal in the controller. No templates, no static file serving, no `@nestjs/serve-static` dependency.

### Why generate at runtime instead of serving `openapi.json` from disk?

- The controller calls `new OpenApiGeneratorV31(registry.definitions).generateDocument(...)` on each request. This guarantees the spec is always in sync with the code — if a developer adds a path to `registry.ts`, it appears in `/api/docs` on the next request with zero extra steps.
- The existing `scripts/generate-openapi.ts` continues to exist for the `pnpm gen:client` pipeline (which needs a static file for `openapi-typescript`). Both share the same `registry` singleton, so they can never drift.
- The document is ~35KB of JSON. Generation takes <5ms. No caching needed at human-scale traffic.

### CSP Strategy

The global `helmet()` in `main.ts` applies default CSP to every response, which blocks external scripts. Rather than weakening the global CSP for all routes, the `/api/docs` handler overwrites the `Content-Security-Policy` header on its own response. This is a standard Express pattern — the last `setHeader` wins. All other routes retain the strict Helmet defaults.

### Stoplight Elements Configuration

| Prop                     | Value               | Rationale                                                                                                      |
| ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apiDescriptionUrl`      | `/api/openapi.json` | Relative URL so it works behind any proxy/domain.                                                              |
| `router`                 | `hash`              | Prevents the SPA router from clashing with NestJS route resolution. All internal navigation happens after `#`. |
| `layout`                 | `sidebar`           | Three-column layout: sidebar TOC + content + Try It panel. Best for exploring schemas and endpoints.           |
| `tryItCredentialsPolicy` | `include`           | Sends session cookies with Try It requests so authenticated endpoints work if the user is logged in.           |
| `hideExport`             | `true`              | The raw spec is already available at `/api/openapi.json`.                                                      |

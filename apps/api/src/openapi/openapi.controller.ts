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
   *
   * The `securitySchemes` component is registered inside `registry.ts`
   * via `registerComponent` — it is NOT passed in the config here,
   * because `generateDocument` omits `components` from its config type
   * (the library builds `components` from the registry definitions).
   */
  @Get("openapi.json")
  getSpec() {
    const generator = new OpenApiGeneratorV31(registry.definitions);
    return generator.generateDocument({
      openapi: "3.1.0",
      info: {
        title: "Vyaya API",
        version: "1.0.0",
        description:
          "Personal expense tracker with an append-only, double-entry-style ledger. " +
          "All money values are integer paise (amountMinor). The ledger is immutable — " +
          "corrections are compensating reversal entries, never updates or deletes."
      },
      servers: [{ url: "/api" }]
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
    <title>Vyaya API Documentation</title>

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

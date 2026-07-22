import type { Response } from "express";
import { describe, it, expect, vi } from "vitest";

import { OpenApiController } from "../openapi.controller.js";

describe("OpenApiController", () => {
  const controller = new OpenApiController();

  describe("GET /openapi.json", () => {
    it("returns a valid OpenAPI 3.1 document with core resource paths", () => {
      const spec = controller.getSpec();
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.info.title).toBe("TreasuryOps API");
      expect(spec.paths).toBeDefined();
      expect(spec.components?.schemas).toBeDefined();
      expect(spec.components?.securitySchemes?.["cookieAuth"]).toBeDefined();

      const paths = Object.keys(spec.paths ?? {});
      expect(paths).toContain("/v1/accounts");
      expect(paths).toContain("/v1/categories");
      expect(paths).toContain("/v1/transactions");
      expect(paths).toContain("/v1/transactions/{transactionId}");
      expect(paths).toContain("/v1/category-rules");
      expect(paths).toContain("/v1/category-rules/{ruleId}");
      expect(paths).toContain("/v1/export/csv");
      expect(paths).toContain("/v1/profile");
      expect(paths).toContain("/v1/recurring");
      expect(paths).toContain("/v1/recurring/{ruleId}");
      expect(paths).toContain("/v1/imports/accounts/{accountId}/mapping");
    });

    it("publishes required idempotency headers for UI mutation contracts", () => {
      const spec = controller.getSpec();
      const mutationOperations = [
        spec.paths?.["/v1/accounts"]?.post,
        spec.paths?.["/v1/accounts/{accountId}/archive"]?.patch,
        spec.paths?.["/v1/categories"]?.post,
        spec.paths?.["/v1/categories/{categoryId}/archive"]?.patch,
        spec.paths?.["/v1/category-rules"]?.post,
        spec.paths?.["/v1/category-rules/{ruleId}"]?.delete,
        spec.paths?.["/v1/transfers"]?.post,
        spec.paths?.["/v1/assets"]?.post,
        spec.paths?.["/v1/assets/{assetId}/close"]?.post,
        spec.paths?.["/v1/assets/{assetId}/valuations"]?.post,
        spec.paths?.["/v1/transactions/{transactionId}"]?.patch,
        spec.paths?.["/v1/recurring"]?.post,
        spec.paths?.["/v1/recurring/{ruleId}"]?.patch
      ];

      for (const operation of mutationOperations) {
        expect(operation?.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ in: "header", name: "Idempotency-Key", required: true })
          ])
        );
      }
    });

    it("describes CSV, profile, and saved-mapping response contracts", () => {
      const spec = controller.getSpec();
      const csvResponse = spec.paths?.["/v1/export/csv"]?.get?.responses?.["200"];
      expect(csvResponse).toMatchObject({
        content: { "text/csv; charset=utf-8": { schema: { type: "string" } } },
        headers: { "Content-Disposition": expect.any(Object) }
      });
      expect(spec.paths?.["/v1/profile"]?.get?.responses?.["404"]).toBeDefined();
      expect(
        spec.paths?.["/v1/imports/accounts/{accountId}/mapping"]?.get?.responses?.["404"]
      ).toBeDefined();
    });
  });

  describe("GET /docs", () => {
    it("returns HTML containing the Stoplight Elements web component", () => {
      const setHeader = vi.fn();
      // @ts-expect-error - mock Response for unit testing
      const fakeRes: Response = { setHeader };
      const html = controller.getDocs(fakeRes);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("<elements-api");
      expect(html).toContain('apiDescriptionUrl="/api/openapi.json"');
      expect(html).toContain("@stoplight/elements/styles.min.css");
      expect(html).toContain("@stoplight/elements/web-components.min.js");
    });

    it("sets a permissive CSP header allowing unpkg.com", () => {
      const setHeader = vi.fn();
      // @ts-expect-error - mock Response for unit testing
      const fakeRes: Response = { setHeader };
      controller.getDocs(fakeRes);
      expect(setHeader).toHaveBeenCalledWith(
        "Content-Security-Policy",
        expect.stringContaining("https://unpkg.com")
      );
    });
  });
});

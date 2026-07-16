import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

describe("Sentry scrubbing", () => {
  it("redacts money, descriptions, and passwords from breadcrumbs", () => {
    const breadcrumb: Breadcrumb = {
      category: "transaction.create",
      data: { amountMinor: 12_500, description: "Lunch", password: "secret", status: 201 }
    };

    expect(scrubBreadcrumb(breadcrumb)).toMatchObject({
      data: { amountMinor: "⟨minor⟩", description: "⟨text⟩", password: "⟨text⟩", status: 201 }
    });
  });

  it("leaves breadcrumbs without object data unchanged", () => {
    const breadcrumb: Breadcrumb = { category: "navigation", message: "opened reports" };

    expect(scrubBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });

  it("redacts sensitive request data without changing non-object payloads", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { data: { amountMinor: 500, description: "Bus", route: "/transactions" } }
    };

    expect(scrubEvent(event)).toMatchObject({
      request: { data: { amountMinor: "⟨minor⟩", description: "⟨text⟩", route: "/transactions" } }
    });

    const stringBody: ErrorEvent = { type: undefined, request: { data: "not a form object" } };
    expect(scrubEvent(stringBody)).toBe(stringBody);
  });
});

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { FinancialDiagnosticController } from "../financial-diagnostic.controller.js";

describe("FinancialDiagnosticController", () => {
  const user: AuthenticatedUser = {
    id: "user-1"
  };

  it("delegates to diagnostic service with default or specified asOf", async () => {
    const diagnosticService = {
      getDiagnostic: vi.fn().mockResolvedValue({ overallStatus: "ready" })
    };

    // @ts-expect-error - mock FinancialDiagnosticService for unit testing
    const controller = new FinancialDiagnosticController(diagnosticService);

    // Default without query
    await controller.getDiagnostic(user, {});
    expect(diagnosticService.getDiagnostic).toHaveBeenCalledWith("user-1");

    // With explicit asOf
    const asOfStr = "2026-08-16T00:00:00.000Z";
    await controller.getDiagnostic(user, { asOf: asOfStr });
    expect(diagnosticService.getDiagnostic).toHaveBeenCalledWith("user-1", new Date(asOfStr));
  });
});

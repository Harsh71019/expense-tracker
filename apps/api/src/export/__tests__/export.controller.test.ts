import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { ExportController } from "../export.controller.js";

const user: AuthenticatedUser = { id: "user-1" };

function mockResponse() {
  const response = {
    status: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn()
  };
  response.status.mockReturnValue(response);
  response.setHeader.mockReturnValue(response);
  return response;
}

describe("ExportController", () => {
  it("streams the generated CSV with download headers", async () => {
    const mockService = { generateCsv: vi.fn().mockResolvedValue("Date,Amount\r\n") };
    // @ts-expect-error - mock ExportService for unit testing
    const controller = new ExportController(mockService);
    const response = mockResponse();

    // @ts-expect-error - mock Response for unit testing
    await controller.csv(user, {}, response);

    expect(mockService.generateCsv).toHaveBeenCalledWith("user-1", {});
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="vyaya-export.csv"'
    );
    expect(response.send).toHaveBeenCalledWith("Date,Amount\r\n");
  });

  it("validates and forwards from/to query params", async () => {
    const mockService = { generateCsv: vi.fn().mockResolvedValue("") };
    // @ts-expect-error - mock ExportService for unit testing
    const controller = new ExportController(mockService);
    const response = mockResponse();

    // @ts-expect-error - mock Response for unit testing
    await controller.csv(user, { from: "2026-01-01", to: "2026-02-01" }, response);

    expect(mockService.generateCsv).toHaveBeenCalledWith("user-1", {
      from: new Date("2026-01-01"),
      to: new Date("2026-02-01")
    });
  });

  it("rejects an invalid date query param before calling the service", async () => {
    const mockService = { generateCsv: vi.fn() };
    // @ts-expect-error - mock ExportService for unit testing
    const controller = new ExportController(mockService);
    const response = mockResponse();

    await expect(
      // @ts-expect-error - mock Response for unit testing
      controller.csv(user, { from: "not-a-date" }, response)
    ).rejects.toThrow();
    expect(mockService.generateCsv).not.toHaveBeenCalled();
  });
});

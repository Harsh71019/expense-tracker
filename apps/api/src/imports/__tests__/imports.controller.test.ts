import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { ImportsController } from "../imports.controller.js";

function mockResponse() {
  return { setHeader: vi.fn() };
}

const MAPPING = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

const sampleBatch = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  accountId: "507f1f77bcf86cd799439012",
  filename: "hdfc-july.csv",
  fileHash: "sha256:abc",
  mapping: MAPPING,
  status: "pending" as const,
  stats: { total: 0, staged: 0, duplicates: 0, committed: 0 },
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("ImportsController", () => {
  const user: AuthenticatedUser = { id: "user-1" };
  const file = {
    originalname: "hdfc-july.csv",
    mimetype: "text/csv",
    buffer: Buffer.from("Txn Date,Narration,Amount\n04/07/2026,Chai,-20.00\n", "utf8")
  };

  it("creates the batch and sets Location on a successful upload", async () => {
    const mockService = { createBatch: vi.fn().mockResolvedValue(sampleBatch) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);
    const response = mockResponse();
    const body = { accountId: "507f1f77bcf86cd799439012", mapping: JSON.stringify(MAPPING) };

    // @ts-expect-error - mock Response for unit testing
    const result = await controller.upload(user, file, body, response);

    expect(result).toEqual(sampleBatch);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Location",
      "/api/v1/imports/507f1f77bcf86cd799439011"
    );
    expect(mockService.createBatch).toHaveBeenCalledWith(
      "user-1",
      "507f1f77bcf86cd799439012",
      "hdfc-july.csv",
      "text/csv",
      file.buffer,
      MAPPING
    );
  });

  it("rejects a request with no uploaded file before calling the service", async () => {
    const mockService = { createBatch: vi.fn() };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);
    const response = mockResponse();
    const body = { accountId: "507f1f77bcf86cd799439012", mapping: JSON.stringify(MAPPING) };

    await expect(
      // @ts-expect-error - mock Response for unit testing
      controller.upload(user, undefined, body, response)
    ).rejects.toThrow();
    expect(mockService.createBatch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON in the mapping field before calling the service", async () => {
    const mockService = { createBatch: vi.fn() };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);
    const response = mockResponse();
    const body = { accountId: "507f1f77bcf86cd799439012", mapping: "not-json" };

    await expect(
      // @ts-expect-error - mock Response for unit testing
      controller.upload(user, file, body, response)
    ).rejects.toThrow();
    expect(mockService.createBatch).not.toHaveBeenCalled();
  });

  it("rejects a mapping that fails schema validation before calling the service", async () => {
    const mockService = { createBatch: vi.fn() };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);
    const response = mockResponse();
    const body = {
      accountId: "507f1f77bcf86cd799439012",
      mapping: JSON.stringify({ date: "Txn Date" })
    };

    await expect(
      // @ts-expect-error - mock Response for unit testing
      controller.upload(user, file, body, response)
    ).rejects.toThrow();
    expect(mockService.createBatch).not.toHaveBeenCalled();
  });
});

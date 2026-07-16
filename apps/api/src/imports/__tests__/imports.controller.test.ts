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

  it("lists the user's batches", async () => {
    const mockService = { list: vi.fn().mockResolvedValue([sampleBatch]) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    const result = await controller.list(user);

    expect(result).toEqual([sampleBatch]);
    expect(mockService.list).toHaveBeenCalledWith("user-1");
  });

  it("returns the account's saved mapping, or null if there isn't one", async () => {
    const mockService = { getSavedMapping: vi.fn().mockResolvedValue(null) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    const result = await controller.savedMapping(user, "507f1f77bcf86cd799439012");

    expect(result).toEqual({ mapping: null });
    expect(mockService.getSavedMapping).toHaveBeenCalledWith("user-1", "507f1f77bcf86cd799439012");
  });

  it("previews staged rows with validated query params and a default limit", async () => {
    const mockPage = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
    const mockService = { preview: vi.fn().mockResolvedValue(mockPage) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    const result = await controller.preview(user, "507f1f77bcf86cd799439011", {});

    expect(result).toEqual(mockPage);
    expect(mockService.preview).toHaveBeenCalledWith(
      "user-1",
      "507f1f77bcf86cd799439011",
      undefined,
      50
    );
  });

  it("rejects an out-of-range preview limit before calling the service", () => {
    const mockService = { preview: vi.fn() };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    expect(() => controller.preview(user, "507f1f77bcf86cd799439011", { limit: "500" })).toThrow();
    expect(mockService.preview).not.toHaveBeenCalled();
  });

  it("updates a staged row with a validated patch", async () => {
    const updatedRow = {
      id: "507f1f77bcf86cd799439013",
      batchId: "507f1f77bcf86cd799439011",
      rowNumber: 1,
      raw: {},
      problems: [],
      isDuplicate: false,
      include: false
    };
    const mockService = { updateRow: vi.fn().mockResolvedValue(updatedRow) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    const result = await controller.updateRow(
      user,
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439013",
      { include: false }
    );

    expect(result).toEqual(updatedRow);
    expect(mockService.updateRow).toHaveBeenCalledWith(
      "user-1",
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439013",
      { include: false }
    );
  });

  it("rejects an empty row patch before calling the service", () => {
    const mockService = { updateRow: vi.fn() };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    expect(() =>
      controller.updateRow(user, "507f1f77bcf86cd799439011", "507f1f77bcf86cd799439013", {})
    ).toThrow();
    expect(mockService.updateRow).not.toHaveBeenCalled();
  });

  it("commits a batch", async () => {
    const mockService = { commitBatch: vi.fn().mockResolvedValue(sampleBatch) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    const result = await controller.commit(user, "507f1f77bcf86cd799439011");

    expect(result).toEqual(sampleBatch);
    expect(mockService.commitBatch).toHaveBeenCalledWith("user-1", "507f1f77bcf86cd799439011");
  });

  it("reverts a batch", async () => {
    const mockService = { revertBatch: vi.fn().mockResolvedValue(sampleBatch) };
    // @ts-expect-error - mock ImportsService for unit testing
    const controller = new ImportsController(mockService);

    const result = await controller.revert(user, "507f1f77bcf86cd799439011");

    expect(result).toEqual(sampleBatch);
    expect(mockService.revertBatch).toHaveBeenCalledWith("user-1", "507f1f77bcf86cd799439011");
  });
});

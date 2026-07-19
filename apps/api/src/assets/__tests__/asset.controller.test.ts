import { describe, expect, it, vi } from "vitest";
import { AssetController } from "../asset.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";

function mockResponse() {
  return { setHeader: vi.fn() };
}

const sampleAsset = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  kind: "fixed_deposit" as const,
  name: "HDFC FD",
  openedAt: new Date(),
  isClosed: false,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("AssetController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("creates an asset and sets the Location header", async () => {
    const mockService = { create: vi.fn().mockResolvedValue(sampleAsset) };
    // @ts-expect-error - mock AssetService for unit testing
    const controller = new AssetController(mockService);
    const body = {
      kind: "fixed_deposit",
      name: "HDFC FD",
      openedAt: "2026-01-01T00:00:00.000Z",
      openingValueMinor: 100_000_00
    };
    const response = mockResponse();

    // @ts-expect-error - mock Response for unit testing
    const result = await controller.create(user, body, response);

    expect(result).toEqual(sampleAsset);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Location",
      "/api/v1/assets/3fa85f64-5717-4562-b3fc-2c963f66beef"
    );
    expect(mockService.create).toHaveBeenCalledWith("user-1", {
      kind: "fixed_deposit",
      name: "HDFC FD",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      openingValueMinor: 100_000_00
    });
  });

  it("lists assets for the current user", async () => {
    const mockService = { list: vi.fn().mockResolvedValue([sampleAsset]) };
    // @ts-expect-error - mock AssetService for unit testing
    const controller = new AssetController(mockService);

    const result = await controller.list(user);

    expect(result).toEqual([sampleAsset]);
    expect(mockService.list).toHaveBeenCalledWith("user-1");
  });

  it("closes an asset", async () => {
    const mockService = { close: vi.fn().mockResolvedValue(undefined) };
    // @ts-expect-error - mock AssetService for unit testing
    const controller = new AssetController(mockService);

    await controller.close(user, "3fa85f64-5717-4562-b3fc-2c963f66beef");

    expect(mockService.close).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef"
    );
  });

  it("adds a valuation and sets the Location header", async () => {
    const valuation = {
      id: "3fa85f64-5717-4562-b3fc-2c963f66be22",
      userId: "user-1",
      assetId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      valueMinor: 105_000_00,
      valuedAt: new Date(),
      source: "manual" as const,
      createdAt: new Date()
    };
    const mockService = { addValuation: vi.fn().mockResolvedValue(valuation) };
    // @ts-expect-error - mock AssetService for unit testing
    const controller = new AssetController(mockService);
    const response = mockResponse();

    const result = await controller.addValuation(
      user,
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      { valueMinor: 105_000_00, valuedAt: "2026-06-01T00:00:00.000Z" },
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(result).toEqual(valuation);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Location",
      "/api/v1/assets/3fa85f64-5717-4562-b3fc-2c963f66beef/valuations/3fa85f64-5717-4562-b3fc-2c963f66be22"
    );
    expect(mockService.addValuation).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef",
      {
        valueMinor: 105_000_00,
        valuedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "manual"
      }
    );
  });

  it("lists valuation history for an asset", async () => {
    const page = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 0 } };
    const mockService = { listValuations: vi.fn().mockResolvedValue(page) };
    // @ts-expect-error - mock AssetService for unit testing
    const controller = new AssetController(mockService);

    const result = await controller.listValuations(user, "3fa85f64-5717-4562-b3fc-2c963f66beef");

    expect(result).toEqual(page);
    expect(mockService.listValuations).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef"
    );
  });

  it("uses replay-aware asset mutation paths", async () => {
    const valuation = {
      id: "3fa85f64-5717-4562-b3fc-2c963f66be22",
      userId: "user-1",
      assetId: sampleAsset.id,
      valueMinor: 105_000_00,
      valuedAt: new Date(),
      source: "manual" as const,
      createdAt: new Date()
    };
    const mockService = { create: vi.fn(), close: vi.fn(), addValuation: vi.fn() };
    const mockMutations = {
      create: vi.fn().mockResolvedValue({ result: sampleAsset, replayed: true }),
      close: vi.fn().mockResolvedValue({ result: null, replayed: true }),
      addValuation: vi.fn().mockResolvedValue({ result: valuation, replayed: true })
    };
    // @ts-expect-error - mock services for unit testing
    const controller = new AssetController(mockService, mockMutations);
    const response = { status: vi.fn(), setHeader: vi.fn() };
    response.status.mockReturnValue(response);

    await controller.create(
      user,
      {
        kind: "fixed_deposit",
        name: "HDFC FD",
        openedAt: "2026-01-01T00:00:00.000Z",
        openingValueMinor: 100_000_00
      },
      // @ts-expect-error - mock Response for unit testing
      response,
      "23232323-aaaa-4232-8232-232323232323"
    );
    await controller.addValuation(
      user,
      sampleAsset.id,
      { valueMinor: 105_000_00, valuedAt: "2026-06-01T00:00:00.000Z" },
      // @ts-expect-error - mock Response for unit testing
      response,
      "24242424-aaaa-4242-8242-242424242424"
    );
    await controller.close(
      user,
      sampleAsset.id,
      "25252525-aaaa-4252-8252-252525252525",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });
});

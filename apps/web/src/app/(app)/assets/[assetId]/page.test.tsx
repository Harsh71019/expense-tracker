import { render, screen } from "@testing-library/react";
import type { Asset } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import AssetDetailPage from "./page";

const mockAsset: Asset = {
  id: "asset-456",
  userId: "u1",
  kind: "fixed_deposit",
  name: "SBI FD",
  openedAt: new Date("2025-01-01T00:00:00.000Z"),
  isClosed: false,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z")
};

const mocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getValuations: vi.fn(),
  getMarketRates: vi.fn(),
  notFound: vi.fn()
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/features/assets/server/get-asset", () => ({
  getAsset: mocks.getAsset
}));
vi.mock("@/features/assets/server/get-valuations", () => ({
  getValuations: mocks.getValuations
}));
vi.mock("@/features/assets/server/get-market-rates", () => ({
  getMarketRates: mocks.getMarketRates
}));

vi.mock("@/features/assets", () => ({
  AssetDetail: ({ initialAsset }: Readonly<{ initialAsset: Asset }>) => (
    <h1>Asset: {initialAsset.name}</h1>
  )
}));

describe("AssetDetailPage Route", () => {
  it("renders AssetDetail when asset is found", async () => {
    mocks.getAsset.mockResolvedValue(mockAsset);
    mocks.getValuations.mockResolvedValue({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 0 }
    });
    mocks.getMarketRates.mockResolvedValue(null);

    const jsx = await AssetDetailPage({ params: Promise.resolve({ assetId: "asset-456" }) });
    render(jsx);

    expect(screen.getByRole("heading", { name: "Asset: SBI FD" })).toBeVisible();
  });

  it("calls notFound when asset does not exist", async () => {
    mocks.getAsset.mockResolvedValue(null);
    mocks.getValuations.mockResolvedValue({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 0 }
    });
    mocks.getMarketRates.mockResolvedValue(null);

    await expect(
      AssetDetailPage({ params: Promise.resolve({ assetId: "non-existent" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});

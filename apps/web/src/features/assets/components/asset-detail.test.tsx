import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, MarketRates, ValuationPage } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AssetDetail } from "./asset-detail";

const mocks = vi.hoisted(() => ({
  createValuationMutateAsync: vi.fn(),
  closeAssetMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

vi.mock("../hooks/use-asset", () => ({
  useAsset: (_id: string, initialData: unknown) => ({ data: initialData })
}));

vi.mock("../hooks/use-valuations", () => ({
  useValuations: (_id: string, initialData: unknown) => ({ data: initialData })
}));

vi.mock("../hooks/use-market-rates", () => ({
  useMarketRates: (initialData: unknown) => ({ data: initialData })
}));

vi.mock("../hooks/use-asset-mutations", () => ({
  useCreateValuation: () => ({
    mutateAsync: mocks.createValuationMutateAsync,
    isPending: false
  }),
  useCloseAsset: () => ({
    mutateAsync: mocks.closeAssetMutateAsync,
    isPending: false
  })
}));

const mockFdAsset: Asset = {
  id: "fd-123",
  userId: "u1",
  kind: "fixed_deposit",
  name: "SBI 1Y Term Deposit",
  openedAt: new Date("2025-01-01T00:00:00.000Z"),
  maturityAt: new Date("2026-01-01T00:00:00.000Z"),
  annualRateBps: 750,
  isClosed: false,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z")
};

const mockGoldAsset: Asset = {
  id: "gold-123",
  userId: "u1",
  kind: "gold",
  name: "Physical Gold Bullion",
  openedAt: new Date("2025-01-01T00:00:00.000Z"),
  quantityMilliUnits: 10000, // 10.000 g
  isClosed: false,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z")
};

const mockValuations: ValuationPage = {
  items: [
    {
      id: "val-2",
      assetId: "fd-123",
      userId: "u1",
      valueMinor: 10750000,
      valuedAt: new Date("2026-01-01T00:00:00.000Z"),
      source: "manual",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "val-1",
      assetId: "fd-123",
      userId: "u1",
      valueMinor: 10000000,
      valuedAt: new Date("2025-01-01T00:00:00.000Z"),
      source: "manual",
      createdAt: new Date("2025-01-01T00:00:00.000Z")
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 10 }
};

const mockMarketRates: MarketRates = {
  asOf: new Date("2026-08-22T17:00:00.000Z"),
  source: "gold_api",
  isStale: false,
  gold: {
    priceMicroRupeesPerGram: 14_400_000_000,
    priceMinorPerGram: 1440000,
    priceFormatted: "₹14,400.00 / g",
    providerAsOf: new Date("2026-08-22T17:00:00.000Z")
  },
  silver: {
    priceMicroRupeesPerGram: 160_000_000,
    priceMinorPerGram: 16000,
    priceFormatted: "₹160.00 / g",
    providerAsOf: new Date("2026-08-22T17:00:00.000Z")
  }
};

describe("AssetDetail", () => {
  it("renders header, stats, and valuation history for a fixed deposit", () => {
    render(
      <AssetDetail
        initialAsset={mockFdAsset}
        initialValuations={mockValuations}
        initialMarketRates={mockMarketRates}
      />
    );

    expect(screen.getByRole("heading", { name: "SBI 1Y Term Deposit" })).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("Interest & Maturity")).toBeVisible();
    expect(screen.getByText("Valuation History")).toBeVisible();
    expect(screen.getByText("Valuation Trajectory")).toBeVisible();
  });

  it("renders live metal rates and enables 1-click sync for gold", async () => {
    const user = userEvent.setup();
    mocks.createValuationMutateAsync.mockResolvedValue({});

    render(
      <AssetDetail
        initialAsset={mockGoldAsset}
        initialValuations={{
          items: [
            {
              id: "val-g1",
              assetId: "gold-123",
              userId: "u1",
              valueMinor: 10000000, // 1 Lakh initial
              valuedAt: new Date("2025-01-01T00:00:00.000Z"),
              source: "manual",
              createdAt: new Date("2025-01-01T00:00:00.000Z")
            }
          ],
          pageInfo: { nextCursor: null, hasMore: false, limit: 10 }
        }}
        initialMarketRates={mockMarketRates}
      />
    );

    expect(screen.getByText("₹14,400.00 / g")).toBeVisible();
    expect(screen.getByText("10.000")).toBeVisible();

    const syncBtn = screen.getByRole("button", { name: "Sync indicative rate" });
    expect(syncBtn).toBeVisible();

    await user.click(syncBtn);
    // 10 grams * 1440000 paise = 14400000 paise
    expect(mocks.createValuationMutateAsync).toHaveBeenCalledWith({
      assetId: "gold-123",
      body: expect.objectContaining({
        valueMinor: 14400000,
        source: "manual"
      })
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Valuation synced to indicative spot reference"
    );
  });

  it("allows opening and closing the close asset dialog", async () => {
    const user = userEvent.setup();
    mocks.closeAssetMutateAsync.mockResolvedValue({});

    render(
      <AssetDetail
        initialAsset={mockFdAsset}
        initialValuations={mockValuations}
        initialMarketRates={mockMarketRates}
      />
    );

    const closeBtn = screen.getByRole("button", { name: "Close asset" });
    await user.click(closeBtn);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeVisible();
    const confirmBtn = within(dialog).getByRole("button", { name: "Close asset" });
    await user.click(confirmBtn);

    expect(mocks.closeAssetMutateAsync).toHaveBeenCalledWith("fd-123");
  });
});

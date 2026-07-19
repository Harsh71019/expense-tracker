import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, NetWorth } from "@vyaya/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetManager } from "./asset-manager";

const mocks = vi.hoisted(() => {
  const assets: Asset[] = [];
  return {
    assets,
    closeMutateAsync: vi.fn(),
    closePending: false,
    createAssetMutateAsync: vi.fn(),
    createValuationMutateAsync: vi.fn(),
    toastError: vi.fn()
  };
});

vi.mock("../hooks/use-assets", () => ({ useAssets: () => ({ data: mocks.assets }) }));
vi.mock("@/features/net-worth/hooks/use-net-worth", () => ({
  useNetWorth: () => ({ data: undefined })
}));
vi.mock("../hooks/use-asset-mutations", () => ({
  useCloseAsset: () => ({ mutateAsync: mocks.closeMutateAsync, isPending: mocks.closePending }),
  useCreateAsset: () => ({ mutateAsync: mocks.createAssetMutateAsync, isPending: false }),
  useCreateValuation: () => ({ mutateAsync: mocks.createValuationMutateAsync, isPending: false })
}));
vi.mock("../hooks/use-valuations", () => ({
  useValuations: () => ({
    data: { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } }
  })
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "507f1f77bcf86cd799439021",
    userId: "u1",
    kind: "fixed_deposit",
    name: "HDFC FD 2025",
    openedAt: new Date("2025-04-01T00:00:00.000Z"),
    isClosed: false,
    createdAt: new Date("2025-04-01T00:00:00.000Z"),
    updatedAt: new Date("2025-04-01T00:00:00.000Z"),
    ...overrides
  };
}

const netWorth: NetWorth = {
  asOf: new Date("2026-07-18T00:00:00.000Z"),
  netWorthMinor: 0,
  accounts: [],
  assets: []
};

describe("AssetManager", () => {
  beforeEach(() => {
    mocks.assets = [];
    mocks.closeMutateAsync.mockReset();
    mocks.closePending = false;
    mocks.createAssetMutateAsync.mockReset();
    mocks.createValuationMutateAsync.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows an empty state with no assets", () => {
    render(<AssetManager initialAssets={[]} initialNetWorth={null} />);
    expect(screen.getByText("No active assets")).toBeVisible();
  });

  it("lists assets by kind filter and opens the create drawer", async () => {
    const user = userEvent.setup();
    mocks.assets = [
      makeAsset(),
      makeAsset({ id: "507f1f77bcf86cd799439022", kind: "gold", name: "Gold coins" })
    ];
    render(<AssetManager initialAssets={mocks.assets} initialNetWorth={netWorth} />);

    expect(screen.getByText("HDFC FD 2025")).toBeVisible();
    expect(screen.getByText("Gold coins")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /^Gold/ }));
    expect(screen.getByText("Gold coins")).toBeVisible();
    expect(screen.queryByText("HDFC FD 2025")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /New asset/ }));
    expect(screen.getByRole("heading", { name: "New asset" })).toBeVisible();
  });

  it("opens the add-valuation dialog and the history drawer for the right asset", async () => {
    const user = userEvent.setup();
    mocks.assets = [makeAsset()];
    render(<AssetManager initialAssets={mocks.assets} initialNetWorth={netWorth} />);

    await user.click(screen.getByRole("button", { name: "+ Add valuation" }));
    expect(screen.getByText(/A new point-in-time value for/)).toBeVisible();
    expect(screen.getByText("HDFC FD 2025", { selector: "strong" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "0 valuations" }));
    expect(screen.getByText("VALUATION HISTORY")).toBeVisible();
  });

  it("closes an asset after confirming", async () => {
    const user = userEvent.setup();
    mocks.assets = [makeAsset()];
    mocks.closeMutateAsync.mockResolvedValue(undefined);
    render(<AssetManager initialAssets={mocks.assets} initialNetWorth={netWorth} />);

    await user.click(screen.getByRole("button", { name: "Close HDFC FD 2025" }));
    expect(screen.getByText("Close HDFC FD 2025?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close asset" }));

    expect(mocks.closeMutateAsync).toHaveBeenCalledWith(mocks.assets[0]?.id);
  });
});

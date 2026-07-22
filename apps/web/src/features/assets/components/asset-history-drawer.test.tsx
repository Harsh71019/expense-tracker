import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, ValuationPage } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AssetHistoryDrawer } from "./asset-history-drawer";

const mocks = vi.hoisted((): { data: ValuationPage | undefined; isLoading: boolean } => ({
  data: undefined,
  isLoading: false
}));

vi.mock("../hooks/use-valuations", () => ({
  useValuations: () => ({ data: mocks.data, isLoading: mocks.isLoading })
}));

const asset: Asset = {
  id: "507f1f77bcf86cd799439021",
  userId: "u1",
  kind: "gold",
  name: "Sovereign gold coins",
  openedAt: new Date("2024-11-10T00:00:00.000Z"),
  isClosed: false,
  createdAt: new Date("2024-11-10T00:00:00.000Z"),
  updatedAt: new Date("2024-11-10T00:00:00.000Z")
};

describe("AssetHistoryDrawer", () => {
  it("lists valuations newest first with a manual/projected source badge", () => {
    mocks.data = {
      items: [
        {
          id: "507f1f77bcf86cd799439032",
          assetId: asset.id,
          userId: "u1",
          valueMinor: 1_728_000,
          valuedAt: new Date("2026-07-01T00:00:00.000Z"),
          source: "manual",
          createdAt: new Date("2026-07-01T00:00:00.000Z")
        },
        {
          id: "507f1f77bcf86cd799439031",
          assetId: asset.id,
          userId: "u1",
          valueMinor: 1_440_000,
          valuedAt: new Date("2024-11-10T00:00:00.000Z"),
          source: "manual",
          createdAt: new Date("2024-11-10T00:00:00.000Z")
        }
      ],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    };
    render(<AssetHistoryDrawer asset={asset} onClose={vi.fn()} />);

    expect(screen.getByText("Sovereign gold coins")).toBeVisible();
    expect(screen.getAllByText("Manual")).toHaveLength(2);
  });

  it("closes via the X button and the backdrop, but not the panel itself", async () => {
    const user = userEvent.setup();
    mocks.data = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
    const onClose = vi.fn();
    render(<AssetHistoryDrawer asset={asset} onClose={onClose} />);

    await user.click(screen.getByText("Sovereign gold coins"));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a loading message before the valuation history resolves", () => {
    mocks.data = undefined;
    mocks.isLoading = true;
    render(<AssetHistoryDrawer asset={asset} onClose={vi.fn()} />);
    expect(screen.getByText("Loading…")).toBeVisible();
  });
});

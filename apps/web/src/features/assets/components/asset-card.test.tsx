import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, NetWorthAsset, Valuation, ValuationPage } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AssetCard } from "./asset-card";

const mocks = vi.hoisted((): { valuations: ValuationPage | undefined } => ({
  valuations: undefined
}));

vi.mock("../hooks/use-valuations", () => ({
  useValuations: () => ({ data: mocks.valuations })
}));

function valuation(overrides: Partial<Valuation> = {}): Valuation {
  return {
    id: "507f1f77bcf86cd799439031",
    assetId: "507f1f77bcf86cd799439021",
    userId: "u1",
    valueMinor: 5_000_000,
    valuedAt: new Date("2026-07-01T00:00:00.000Z"),
    source: "manual",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "507f1f77bcf86cd799439021",
    userId: "u1",
    kind: "fixed_deposit",
    name: "HDFC FD 2025",
    openedAt: new Date("2025-04-01T00:00:00.000Z"),
    maturityAt: new Date("2027-04-01T00:00:00.000Z"),
    annualRateBps: 725,
    isClosed: false,
    createdAt: new Date("2025-04-01T00:00:00.000Z"),
    updatedAt: new Date("2025-04-01T00:00:00.000Z"),
    ...overrides
  };
}

const netWorthEntry: NetWorthAsset = {
  assetId: "507f1f77bcf86cd799439021",
  name: "HDFC FD 2025",
  kind: "fixed_deposit",
  valueMinor: 5_181_000,
  valuedAt: new Date("2026-04-01T00:00:00.000Z")
};

describe("AssetCard", () => {
  it("shows the FD-specific sub-meta and the kind badge", () => {
    mocks.valuations = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
    render(
      <AssetCard
        asset={asset()}
        netWorthEntry={netWorthEntry}
        onAddValuation={vi.fn()}
        onHistory={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("HDFC FD 2025")).toBeVisible();
    expect(screen.getByText("FD")).toBeVisible();
    expect(screen.getByText(/7\.25% p\.a\. · matures/)).toBeVisible();
  });

  it("falls back to the net-worth value while the valuation history is still loading", () => {
    mocks.valuations = undefined;
    render(
      <AssetCard
        asset={asset()}
        netWorthEntry={netWorthEntry}
        onAddValuation={vi.fn()}
        onHistory={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("+₹51,810.00")).toBeVisible();
  });

  it("shows a projected badge once the latest valuation resolves as a maturity projection", () => {
    mocks.valuations = {
      items: [valuation({ source: "maturity_projection", valueMinor: 5_368_500 })],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    };
    render(
      <AssetCard
        asset={asset()}
        netWorthEntry={netWorthEntry}
        onAddValuation={vi.fn()}
        onHistory={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("✦ PROJECTED")).toBeVisible();
  });

  it("shows No valuation when neither source has a value", () => {
    mocks.valuations = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
    render(
      <AssetCard
        asset={asset()}
        netWorthEntry={undefined}
        onAddValuation={vi.fn()}
        onHistory={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("No valuation")).toBeVisible();
  });

  it("fires the add-valuation, history, and close callbacks", async () => {
    const user = userEvent.setup();
    const onAddValuation = vi.fn();
    const onHistory = vi.fn();
    const onClose = vi.fn();
    mocks.valuations = {
      items: [valuation()],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    };
    const target = asset();
    render(
      <AssetCard
        asset={target}
        netWorthEntry={netWorthEntry}
        onAddValuation={onAddValuation}
        onHistory={onHistory}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: "+ Add valuation" }));
    expect(onAddValuation).toHaveBeenCalledWith(target);

    await user.click(screen.getByRole("button", { name: "1 valuation" }));
    expect(onHistory).toHaveBeenCalledWith(target);

    await user.click(screen.getByRole("button", { name: `Close ${target.name}` }));
    expect(onClose).toHaveBeenCalledWith(target);
  });
});

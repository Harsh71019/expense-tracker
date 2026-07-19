import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { CloseAssetDialog } from "./close-asset-dialog";

const asset: Asset = {
  id: "507f1f77bcf86cd799439021",
  userId: "u1",
  kind: "fixed_deposit",
  name: "HDFC FD 2025",
  openedAt: new Date("2025-04-01T00:00:00.000Z"),
  isClosed: false,
  createdAt: new Date("2025-04-01T00:00:00.000Z"),
  updatedAt: new Date("2025-04-01T00:00:00.000Z")
};

describe("CloseAssetDialog", () => {
  it("confirms closing via the callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <CloseAssetDialog asset={asset} isPending={false} onCancel={vi.fn()} onConfirm={onConfirm} />
    );

    expect(screen.getByText("Close HDFC FD 2025?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close asset" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancels via the Cancel button and the backdrop, but not the card itself", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <CloseAssetDialog asset={asset} isPending={false} onCancel={onCancel} onConfirm={vi.fn()} />
    );

    await user.click(screen.getByText(/can't be reopened/));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending", () => {
    render(<CloseAssetDialog asset={asset} isPending onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Closing…" })).toBeDisabled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReverseConfirmDialog } from "./reverse-confirm-dialog";

describe("ReverseConfirmDialog", () => {
  it("renders the given copy and confirms via the callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ReverseConfirmDialog
        title="Reverse this transaction?"
        body="This posts a compensating entry."
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Reverse this transaction?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Post reversal/ }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancels via the Cancel button and the backdrop, but not the card itself", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ReverseConfirmDialog
        title="Reverse this transfer?"
        body="Body copy"
        isPending={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByText("Body copy"));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending", () => {
    render(
      <ReverseConfirmDialog
        title="Reverse this transaction?"
        body="Body copy"
        isPending
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Posting reversal/ })).toBeDisabled();
  });
});

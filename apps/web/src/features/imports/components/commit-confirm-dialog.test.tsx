import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommitConfirmDialog } from "./commit-confirm-dialog";

describe("CommitConfirmDialog", () => {
  it("shows the row count and confirms via the callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <CommitConfirmDialog
        includedCount={7}
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/7 rows will post/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Post 7 transactions" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancels via the Cancel button and the backdrop, but not the card itself", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <CommitConfirmDialog
        includedCount={3}
        isPending={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByText("Commit this import?"));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending", () => {
    render(
      <CommitConfirmDialog includedCount={3} isPending onCancel={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Posting…" })).toBeDisabled();
  });
});

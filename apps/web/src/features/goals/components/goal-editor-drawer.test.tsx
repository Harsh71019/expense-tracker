import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GoalEditorDrawer } from "./goal-editor-drawer";

const mutations = vi.hoisted(() => ({
  create: { isPending: false, mutateAsync: vi.fn() },
  update: { isPending: false, mutateAsync: vi.fn() }
}));

vi.mock("../hooks/use-goals", () => ({
  useCreateGoal: () => mutations.create,
  useUpdateGoal: () => mutations.update
}));

describe("GoalEditorDrawer", () => {
  it("requires the binding selected by the funding mode", async () => {
    const user = userEvent.setup();
    render(<GoalEditorDrawer accounts={[]} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "New goal" })).toHaveClass(
      "max-h-[92dvh]",
      "sm:h-dvh"
    );
    expect(screen.getByRole("button", { name: "Close goal form" })).toHaveClass("h-11", "w-11");

    await user.type(screen.getByLabelText("Goal name"), "Laptop");
    const amount = screen.getByLabelText("Target amount");
    await user.clear(amount);
    await user.type(amount, "1000");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /transaction tag/i }));
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(mutations.create.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates a manual envelope goal successfully", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mutations.create.mutateAsync.mockResolvedValueOnce({ id: "g1" });
    render(<GoalEditorDrawer accounts={[]} onClose={onClose} />);

    await user.type(screen.getByLabelText("Goal name"), "Cash Savings");
    const amount = screen.getByLabelText("Target amount");
    await user.clear(amount);
    await user.type(amount, "5000");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(mutations.create.mutateAsync).toHaveBeenCalledWith({
      name: "Cash Savings",
      targetMinor: 5000_00,
      fundingMode: "manual_envelope"
    });
    expect(onClose).toHaveBeenCalled();
  });
});

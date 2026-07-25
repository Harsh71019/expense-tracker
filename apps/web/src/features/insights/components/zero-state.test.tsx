import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ZeroState } from "./zero-state";

describe("ZeroState", () => {
  it("renders a starter option for each account kind and opens create with that type", async () => {
    const user = userEvent.setup();
    const onOpenCreate = vi.fn();
    render(<ZeroState onOpenCreate={onOpenCreate} />);

    expect(screen.getByText("Let's set up your first account")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Investment/ }));

    expect(onOpenCreate).toHaveBeenCalledWith("investment");
  });
});

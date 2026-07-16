import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("forwards native button behaviour and invokes its handler", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button type="button" onClick={onClick}>
        Save
      </Button>
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders disabled secondary buttons with their semantic styles", () => {
    render(
      <Button variant="secondary" disabled>
        Cancel
      </Button>
    );

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("border-border", "disabled:pointer-events-none");
  });
});

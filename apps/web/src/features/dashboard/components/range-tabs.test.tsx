import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RangeTabs } from "./range-tabs";

describe("RangeTabs", () => {
  it("marks the current range as pressed", () => {
    render(<RangeTabs value="6M" onChange={vi.fn()} label="Cash flow range" />);

    expect(screen.getByRole("button", { name: "6M" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the selected range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeTabs value="1M" onChange={onChange} label="Cash flow range" />);

    await user.click(screen.getByRole("button", { name: "12M" }));
    expect(onChange).toHaveBeenCalledWith("12M");
  });
});

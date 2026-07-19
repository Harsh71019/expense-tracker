import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthSelector } from "./month-selector";

const months = ["2026-04", "2026-05", "2026-06"];

describe("MonthSelector", () => {
  it("renders a chip per month and marks the selected one", () => {
    render(
      <MonthSelector
        months={months}
        selected="2026-05"
        canGoNext
        onSelect={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "May 26" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Apr 26" })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects a month via its chip", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MonthSelector
        months={months}
        selected="2026-05"
        canGoNext
        onSelect={onSelect}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Jun 26" }));
    expect(onSelect).toHaveBeenCalledWith("2026-06");
  });

  it("navigates via the prev and next buttons", async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <MonthSelector
        months={months}
        selected="2026-05"
        canGoNext
        onSelect={vi.fn()}
        onPrev={onPrev}
        onNext={onNext}
      />
    );
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onPrev).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("disables Next when canGoNext is false", () => {
    render(
      <MonthSelector
        months={months}
        selected="2026-06"
        canGoNext={false}
        onSelect={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });
});

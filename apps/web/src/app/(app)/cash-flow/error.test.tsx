import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CashflowForecastError from "./error";

describe("CashflowForecastError", () => {
  it("shows an error state and allows retry", () => {
    const reset = vi.fn();
    render(<CashflowForecastError error={new Error("offline")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      screen.getByRole("heading", { name: "Cash-flow forecast is unavailable" })
    ).toBeVisible();
    expect(reset).toHaveBeenCalledOnce();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  InvariantPaiseCalculator,
  InvariantReversalSimulator
} from "./invariants-interactive-tools";

describe("InvariantPaiseCalculator", () => {
  it("calculates exact integer paise for positive rupee amounts", async () => {
    const user = userEvent.setup();
    render(<InvariantPaiseCalculator />);

    expect(screen.getByText("1,24,950 paise")).toBeInTheDocument();
    expect(screen.getByText("(₹1249.50)")).toBeInTheDocument();

    const input = screen.getByLabelText("Enter Amount in INR (₹)");
    await user.clear(input);
    await user.type(input, "500.25");

    expect(screen.getByText("50,025 paise")).toBeInTheDocument();
    expect(screen.getByText("(₹500.25)")).toBeInTheDocument();
  });

  it("handles invalid inputs safely", async () => {
    const user = userEvent.setup();
    render(<InvariantPaiseCalculator />);

    const input = screen.getByLabelText("Enter Amount in INR (₹)");
    await user.clear(input);
    await user.type(input, "abc");

    expect(screen.getByText("Invalid amount")).toBeInTheDocument();
  });
});

describe("InvariantReversalSimulator", () => {
  it("posts a compensating reversal that mathematically neutralizes the net ledger balance", async () => {
    const user = userEvent.setup();
    render(<InvariantReversalSimulator />);

    expect(screen.getByText("Cloud Server Hosting (Original Post)")).toBeInTheDocument();
    expect(screen.getByText("-₹2,499.00 (-249900 paise)")).toBeInTheDocument();

    const postReversalBtn = screen.getByRole("button", {
      name: /Post Compensating Reversal/i
    });
    await user.click(postReversalBtn);

    expect(screen.getByText("Compensating Reversal for txn_01j9a")).toBeInTheDocument();
    expect(screen.getByText("₹0.00 (0 paise · Perfectly Neutralized)")).toBeInTheDocument();
    expect(screen.getByText("Audit Preserved")).toBeInTheDocument();

    // Clicking reset
    const resetBtn = screen.getByRole("button", { name: /Reset Simulation/i });
    await user.click(resetBtn);
    expect(screen.queryByText("Compensating Reversal for txn_01j9a")).not.toBeInTheDocument();
  });
});

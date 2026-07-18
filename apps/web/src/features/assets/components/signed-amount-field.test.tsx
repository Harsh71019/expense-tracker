import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SignedAmountField } from "./signed-amount-field";

describe("SignedAmountField", () => {
  it("commits a typed amount in minor units on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SignedAmountField
        id="amount"
        label="Opening value"
        allowNegative={false}
        negative={false}
        onToggleSign={vi.fn()}
        magnitudeMinor={0}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText("Opening value");
    await user.clear(input);
    await user.type(input, "1234.50");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(123_450);
  });

  it("shows an error for an unparseable amount instead of calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SignedAmountField
        id="amount"
        label="Opening value"
        allowNegative={false}
        negative={false}
        onToggleSign={vi.fn()}
        magnitudeMinor={0}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText("Opening value");
    await user.clear(input);
    await user.type(input, "not a number");
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/valid/i)).toBeVisible();
  });

  it("hides the sign toggle unless negative amounts are allowed", () => {
    const { rerender } = render(
      <SignedAmountField
        id="amount"
        label="Value"
        allowNegative={false}
        negative={false}
        onToggleSign={vi.fn()}
        magnitudeMinor={0}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <SignedAmountField
        id="amount"
        label="Value"
        allowNegative
        negative
        onToggleSign={vi.fn()}
        magnitudeMinor={0}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Switch to positive" })).toBeVisible();
  });

  it("toggles the sign via the callback", async () => {
    const user = userEvent.setup();
    const onToggleSign = vi.fn();
    render(
      <SignedAmountField
        id="amount"
        label="Value"
        allowNegative
        negative={false}
        onToggleSign={onToggleSign}
        magnitudeMinor={0}
        onChange={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Switch to negative" }));
    expect(onToggleSign).toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AmountInput } from "../amount-input";

describe("AmountInput", () => {
  it("commits a paise integer from a decimal amount and reports invalid input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountInput id="amount" label="Amount" value={0} onChange={onChange} />);

    const input = screen.getByLabelText("Amount");
    await user.clear(input);
    await user.type(input, "20.5");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(2_050);

    await user.clear(input);
    await user.type(input, "twenty");
    await user.tab();
    expect(screen.getByText(/valid non-negative INR/i)).toBeVisible();
  });
});

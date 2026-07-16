import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("associates its label and forwards input attributes", async () => {
    const user = userEvent.setup();
    render(<Input id="amount" label="Amount" inputMode="decimal" required />);

    const input = screen.getByLabelText("Amount");
    await user.type(input, "1250.50");

    expect(input).toHaveValue("1250.50");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("inputmode", "decimal");
  });
});

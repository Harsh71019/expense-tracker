import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LiveUiPreview } from "./live-ui-preview";

describe("LiveUiPreview", () => {
  it("renders the overview tab by default and switches between tabs", async () => {
    const user = userEvent.setup();
    render(<LiveUiPreview />);

    expect(screen.getByText("Treasury Reserve")).toBeInTheDocument();
    expect(screen.getByText("₹1,24,500.00")).toBeInTheDocument();

    const ledgerRowsBtn = screen.getByRole("button", { name: "Ledger Rows" });
    await user.click(ledgerRowsBtn);

    expect(screen.getByText("Direct Deposit · Payroll")).toBeInTheDocument();
    expect(screen.getByText("+₹85,000.00")).toBeInTheDocument();
    expect(screen.getByText("Cloud Server · VPS Hosting")).toBeInTheDocument();

    const paiseMathBtn = screen.getByRole("button", { name: "Paise Math" });
    await user.click(paiseMathBtn);

    expect(screen.getByText("Paise Formula (Integer Minor Units)")).toBeInTheDocument();
  });
});

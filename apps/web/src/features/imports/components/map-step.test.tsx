import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MapStep } from "./map-step";

const mocks = vi.hoisted((): { savedMapping: { mapping: unknown } | undefined } => ({
  savedMapping: undefined
}));

vi.mock("../hooks/use-saved-import-mapping", () => ({
  useSavedImportMapping: () => ({ data: mocks.savedMapping })
}));

describe("MapStep", () => {
  beforeEach(() => {
    mocks.savedMapping = undefined;
  });

  it("reports an incomplete mapping as undefined with an error", () => {
    const onChange = vi.fn();
    render(<MapStep accountId="a1" accountName="HDFC Savings" onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith(undefined, expect.any(String));
  });

  it("fills the debit/credit columns from a preset and reports a valid mapping", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MapStep accountId="a1" accountName="HDFC Savings" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "HDFC" }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date: "Date",
        description: "Narration",
        amountConvention: "debit_credit_cols",
        debit: "Withdrawal Amt.",
        credit: "Deposit Amt."
      }),
      undefined
    );
  });

  it("switches to a single signed-amount column and back", async () => {
    const user = userEvent.setup();
    render(<MapStep accountId="a1" accountName="HDFC Savings" onChange={vi.fn()} />);

    expect(screen.getByLabelText("Debit (withdrawal) column")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /One signed column/ }));
    expect(screen.queryByLabelText("Debit (withdrawal) column")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Signed amount column")).toBeVisible();
  });

  it("shows the saved mapping for the account until the user edits it", async () => {
    const user = userEvent.setup();
    mocks.savedMapping = {
      mapping: {
        date: "Txn Date",
        description: "Remarks",
        dateFormat: "YYYY-MM-DD",
        amountConvention: "single_signed",
        amount: "Amt"
      }
    };
    render(<MapStep accountId="a1" accountName="HDFC Savings" onChange={vi.fn()} />);

    expect(screen.getByText("Using your last mapping for HDFC Savings.")).toBeVisible();
    expect(screen.getByLabelText("Date column")).toHaveValue("Txn Date");

    await user.clear(screen.getByLabelText("Date column"));
    await user.type(screen.getByLabelText("Date column"), "Date");
    expect(screen.queryByText("Using your last mapping for HDFC Savings.")).not.toBeInTheDocument();
  });
});

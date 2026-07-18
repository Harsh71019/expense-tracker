import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Money, SignedMoney } from "../money";

describe("Money", () => {
  it("formats integer paise as rupees", () => {
    render(<Money minor={125_050} />);
    expect(screen.getByText("₹1,250.50")).toBeInTheDocument();
  });

  it("prefixes a plus sign for signed income", () => {
    render(<Money minor={2_000} variant="income" signed />);
    expect(screen.getByText("+₹20.00")).toBeInTheDocument();
  });

  it("prefixes a minus sign for signed expense", () => {
    render(<Money minor={2_000} variant="expense" signed />);
    expect(screen.getByText("−₹20.00")).toBeInTheDocument();
  });

  it("omits the sign when unsigned regardless of variant", () => {
    render(<Money minor={2_000} variant="expense" />);
    expect(screen.getByText("₹20.00")).toBeInTheDocument();
  });

  it("formats signed values without passing negatives to formatMinor", () => {
    render(<SignedMoney minor={-500} />);
    expect(screen.getByText("−₹5.00")).toBeInTheDocument();
  });
});

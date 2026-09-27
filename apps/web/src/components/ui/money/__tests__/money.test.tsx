import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Money, SignedMoney } from "../money";

describe("Money", () => {
  it("declares the client boundary required by the privacy hook", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/ui/money/money.tsx"),
      "utf8"
    );
    expect(source.startsWith('"use client";')).toBe(true);
  });

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

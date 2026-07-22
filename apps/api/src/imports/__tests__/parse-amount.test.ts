import type { ColumnMapping } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { resolveAmount } from "../parse-amount.js";

const SINGLE_SIGNED: ColumnMapping = {
  date: "Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

const DEBIT_CREDIT: ColumnMapping = {
  date: "Date",
  description: "Narration",
  debit: "Withdrawal Amt",
  credit: "Deposit Amt",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "debit_credit_cols"
};

describe("resolveAmount — single_signed", () => {
  it("treats a negative value as an expense", () => {
    expect(resolveAmount({ Amount: "-20.00" }, SINGLE_SIGNED)).toEqual({
      amountMinor: 2_000,
      type: "expense"
    });
  });

  it("treats a positive value as income", () => {
    expect(resolveAmount({ Amount: "1,250.50" }, SINGLE_SIGNED)).toEqual({
      amountMinor: 125_050,
      type: "income"
    });
  });

  it("rejects a zero amount", () => {
    expect(() => resolveAmount({ Amount: "0" }, SINGLE_SIGNED)).toThrow(RangeError);
  });

  it("rejects a missing/blank cell", () => {
    expect(() => resolveAmount({ Amount: "" }, SINGLE_SIGNED)).toThrow(RangeError);
    expect(() => resolveAmount({}, SINGLE_SIGNED)).toThrow(RangeError);
  });
});

describe("resolveAmount — debit_credit_cols", () => {
  it("treats a populated debit column as an expense", () => {
    expect(resolveAmount({ "Withdrawal Amt": "500.00", "Deposit Amt": "" }, DEBIT_CREDIT)).toEqual({
      amountMinor: 50_000,
      type: "expense"
    });
  });

  it("treats a populated credit column as income", () => {
    expect(resolveAmount({ "Withdrawal Amt": "", "Deposit Amt": "10,000" }, DEBIT_CREDIT)).toEqual({
      amountMinor: 1_000_000,
      type: "income"
    });
  });

  it("rejects a row where both columns are populated", () => {
    expect(() =>
      resolveAmount({ "Withdrawal Amt": "500", "Deposit Amt": "500" }, DEBIT_CREDIT)
    ).toThrow(RangeError);
  });

  it("rejects a row where neither column is populated", () => {
    expect(() => resolveAmount({ "Withdrawal Amt": "", "Deposit Amt": "" }, DEBIT_CREDIT)).toThrow(
      RangeError
    );
  });
});

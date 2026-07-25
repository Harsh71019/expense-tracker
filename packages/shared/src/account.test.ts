import { describe, expect, it } from "vitest";

import { CreateAccountSchema } from "./account.js";

describe("CreateAccountSchema credit-card configuration", () => {
  it("accepts cycle configuration for a credit card", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "HDFC Card",
        type: "credit_card",
        openingBalanceMinor: 0,
        creditCardConfig: { statementDay: 25, dueDay: 15 }
      }).success
    ).toBe(true);
  });

  it("keeps legacy credit-card creation valid without configuration", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "Legacy Card",
        type: "credit_card",
        openingBalanceMinor: 0
      }).success
    ).toBe(true);
  });

  it("rejects cycle configuration for non-card accounts", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "Bank",
        type: "bank",
        openingBalanceMinor: 0,
        creditCardConfig: { statementDay: 25, dueDay: 15 }
      }).success
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { isUniqueViolation, postgresConstraint } from "../postgres-error.js";

describe("postgres-error", () => {
  it("detects unique violation code 23505 directly and via cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "12345" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(123)).toBe(false);
  });

  it("extracts constraint name directly and via cause", () => {
    expect(postgresConstraint({ constraint: "user_email_unique" })).toBe("user_email_unique");
    expect(postgresConstraint({ cause: { constraint: "accounts_name_unique" } })).toBe(
      "accounts_name_unique"
    );
    expect(postgresConstraint({ code: "23505" })).toBeUndefined();
    expect(postgresConstraint(undefined)).toBeUndefined();
  });
});

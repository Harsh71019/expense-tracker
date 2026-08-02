import { describe, expect, it } from "vitest";

import { buildSyntheticPersonalFinanceHistory } from "../synthetic-history.js";

function weekday(calendarDate: string): number {
  const parts = calendarDate.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError("test calendar date is invalid.");
  }
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

describe("deterministic synthetic personal-finance history", () => {
  it("reproduces the same versioned fixture for the same seed", () => {
    const first = buildSyntheticPersonalFinanceHistory({
      seed: 42,
      startMonth: "2024-01",
      monthCount: 24
    });
    const second = buildSyntheticPersonalFinanceHistory({
      seed: 42,
      startMonth: "2024-01",
      monthCount: 24
    });
    const alternate = buildSyntheticPersonalFinanceHistory({
      seed: 43,
      startMonth: "2024-01",
      monthCount: 24
    });

    expect(first).toEqual(second);
    expect(first.datasetVersion).toBe(1);
    expect(first.events).not.toEqual(alternate.events);
    expect(first.truth).toEqual(alternate.truth);
  });

  it("contains every labeled scenario required by the offline evaluation plan", () => {
    const history = buildSyntheticPersonalFinanceHistory();
    const eventKinds = new Set(history.events.map((event) => event.kind));
    const truthKinds = new Set(history.truth.map((annotation) => annotation.kind));

    expect(eventKinds).toEqual(
      new Set([
        "salary",
        "rent",
        "groceries",
        "biweekly_service",
        "utility",
        "annual_membership",
        "travel_shock",
        "medical_shock",
        "ordinary_purchase",
        "transfer",
        "reversal",
        "credit_card_purchase",
        "credit_card_statement",
        "credit_card_payment"
      ])
    );
    expect(truthKinds).toEqual(
      new Set([
        "category_correction",
        "missing_recurring_event",
        "delayed_recurring_event",
        "gradual_regime_change",
        "abrupt_regime_change",
        "repeated_equal_legitimate_purchase"
      ])
    );
  });

  it("models salary working-day shifts, skipped and delayed recurrences, and annual cadence", () => {
    const history = buildSyntheticPersonalFinanceHistory();
    const salaries = history.events.filter((event) => event.kind === "salary");
    const utilities = history.events.filter((event) => event.kind === "utility");
    const memberships = history.events.filter((event) => event.kind === "annual_membership");

    expect(salaries).toHaveLength(24);
    expect(salaries.every((event) => ![0, 6].includes(weekday(event.calendarDate)))).toBe(true);
    expect(utilities).toHaveLength(23);
    expect(memberships).toHaveLength(2);
    expect(
      history.truth.find((annotation) => annotation.kind === "missing_recurring_event")
    ).toMatchObject({ recurringStreamKey: "monthly_utility" });
    expect(
      history.truth.find((annotation) => annotation.kind === "delayed_recurring_event")
    ).toMatchObject({ recurringStreamKey: "monthly_rent" });
  });

  it("keeps private aliases and changing references synthetic but links them to one truth key", () => {
    const groceries = buildSyntheticPersonalFinanceHistory().events.filter(
      (event) => event.kind === "groceries"
    );
    const narrations = new Set(groceries.map((event) => event.narration));
    const accounts = new Set(groceries.map((event) => event.accountKey));

    expect(groceries.length).toBeGreaterThan(80);
    expect(narrations.size).toBe(groceries.length);
    expect(groceries.every((event) => event.counterpartyKey === "fresh_basket")).toBe(true);
    expect([...narrations].some((narration) => narration.includes("FRESH BASKET"))).toBe(true);
    expect([...narrations].some((narration) => narration.includes("FRESHBASKET"))).toBe(true);
    expect([...narrations].some((narration) => narration.includes("FB MARKET"))).toBe(true);
    expect(accounts).toEqual(new Set(["credit_card", "salary_account"]));
  });

  it("marks equal legitimate purchases without collapsing them as duplicates", () => {
    const history = buildSyntheticPersonalFinanceHistory();
    const annotation = history.truth.find(
      (candidate) => candidate.kind === "repeated_equal_legitimate_purchase"
    );
    expect(annotation?.kind).toBe("repeated_equal_legitimate_purchase");
    if (annotation?.kind !== "repeated_equal_legitimate_purchase") {
      throw new Error("expected repeated-purchase truth annotation.");
    }
    const first = history.events.find((event) => event.id === annotation.eventIds[0]);
    const second = history.events.find((event) => event.id === annotation.eventIds[1]);
    expect(first).toMatchObject({ amountMinor: 64_900, kind: "ordinary_purchase" });
    expect(second).toMatchObject({ amountMinor: 64_900, kind: "ordinary_purchase" });
    expect(first?.calendarDate).toBe(second?.calendarDate);
    expect(first?.id).not.toBe(second?.id);
  });

  it("keeps card purchase, statement, and payment truth coherent for double-counting tests", () => {
    const history = buildSyntheticPersonalFinanceHistory();
    const statements = history.events.filter((event) => event.kind === "credit_card_statement");
    for (const statement of statements) {
      const month = statement.calendarDate.slice(0, 7);
      const purchases = history.events.filter(
        (event) =>
          event.kind === "credit_card_purchase" && event.calendarDate.startsWith(`${month}-`)
      );
      const payment = history.events.find(
        (event) => event.kind === "credit_card_payment" && event.relatedEventId === statement.id
      );
      expect(purchases).toHaveLength(2);
      expect(purchases.reduce((total, event) => total + event.amountMinor, 0)).toBe(
        statement.amountMinor
      );
      expect(payment?.amountMinor).toBe(statement.amountMinor);
    }
  });

  it("returns chronologically ordered, unique, positive-integer synthetic events", () => {
    const history = buildSyntheticPersonalFinanceHistory();
    const ids = new Set<string>();
    let previousDate = "";
    for (const event of history.events) {
      expect(event.calendarDate >= previousDate).toBe(true);
      expect(Number.isSafeInteger(event.amountMinor)).toBe(true);
      expect(event.amountMinor).toBeGreaterThan(0);
      expect(ids.has(event.id)).toBe(false);
      ids.add(event.id);
      previousDate = event.calendarDate;
    }
  });

  it("rejects ranges that cannot contain the complete evaluation scenarios", () => {
    expect(() => buildSyntheticPersonalFinanceHistory({ monthCount: 17 })).toThrow(
      "monthCount must be between"
    );
    expect(() => buildSyntheticPersonalFinanceHistory({ monthCount: 61 })).toThrow(
      "monthCount must be between"
    );
    expect(() => buildSyntheticPersonalFinanceHistory({ startMonth: "2024-13" })).toThrow(
      "valid calendar month"
    );
    expect(() => buildSyntheticPersonalFinanceHistory({ startMonth: "2024/01" })).toThrow(
      "YYYY-MM"
    );
    expect(() => buildSyntheticPersonalFinanceHistory({ seed: Number.MAX_VALUE })).toThrow(
      "safe integer"
    );
  });
});

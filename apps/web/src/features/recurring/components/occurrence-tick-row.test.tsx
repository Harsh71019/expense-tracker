import { render, screen } from "@testing-library/react";
import type { RecurringOccurrence } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { OccurrenceTickRow } from "./occurrence-tick-row";

const mocks = vi.hoisted(() => {
  const occurrences: { data: RecurringOccurrence[] | undefined } = { data: undefined };
  return { occurrences };
});

vi.mock("../hooks/use-recurring-occurrences", () => ({
  useRecurringOccurrences: () => ({ data: mocks.occurrences.data })
}));

const timestamp = new Date("2026-07-01T00:00:00.000Z");

function occurrence(id: string, status: RecurringOccurrence["status"]): RecurringOccurrence {
  return {
    id,
    userId: "user-1",
    recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    occurredAt: timestamp,
    status,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("OccurrenceTickRow", () => {
  it("renders nothing while there is no occurrence data yet", () => {
    mocks.occurrences.data = undefined;
    const { container } = render(<OccurrenceTickRow ruleId="rule-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no occurrences", () => {
    mocks.occurrences.data = [];
    const { container } = render(<OccurrenceTickRow ruleId="rule-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one tick per occurrence, most recent first", () => {
    mocks.occurrences.data = [
      occurrence("3fa85f64-5717-4562-b3fc-2c963f66be02", "confirmed"),
      occurrence("3fa85f64-5717-4562-b3fc-2c963f66be03", "missed")
    ];
    render(<OccurrenceTickRow ruleId="rule-1" />);
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("✕")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatCard, StatCardLabel, StatCardValue } from "../stat-card";

describe("StatCard", () => {
  it("renders as an article by default with the glass-card shell", () => {
    render(<StatCard data-testid="card">content</StatCard>);
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("ARTICLE");
    expect(card).toHaveClass("glass-card");
    expect(card).toHaveClass("glass-card-hover");
  });

  it("renders as the requested element and drops the hover class when hoverable is false", () => {
    render(
      <StatCard as="section" hoverable={false} data-testid="card">
        content
      </StatCard>
    );
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("SECTION");
    expect(card).not.toHaveClass("glass-card-hover");
  });

  it("applies the requested padding variant", () => {
    render(
      <StatCard padding="sm" data-testid="card">
        content
      </StatCard>
    );
    expect(screen.getByTestId("card")).toHaveClass("p-4.5");
  });
});

describe("StatCardLabel", () => {
  it("renders the uppercase mono label", () => {
    render(<StatCardLabel>Net worth</StatCardLabel>);
    expect(screen.getByText("Net worth")).toHaveClass("uppercase");
  });
});

describe("StatCardValue", () => {
  it("renders the value text", () => {
    render(<StatCardValue>₹1,000</StatCardValue>);
    expect(screen.getByText("₹1,000")).toBeInTheDocument();
  });
});

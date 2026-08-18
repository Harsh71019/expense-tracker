import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvailableCapabilitiesCard } from "./available-capabilities";

describe("AvailableCapabilitiesCard", () => {
  it("renders unlocked capabilities and locked capabilities with requirements", () => {
    render(
      <AvailableCapabilitiesCard
        availableCapabilities={["salary_statistics", "life_hour"]}
        unavailableCapabilities={["essential_burn", "goal_feasibility"]}
      />
    );

    expect(screen.getByText("2 Unlocked")).toBeInTheDocument();
    expect(screen.getByText("Salary Statistics & Take-Home")).toBeInTheDocument();
    expect(screen.getByText("Life-Hour Worth Metric")).toBeInTheDocument();
    expect(screen.getByText("Essential Burn Baseline")).toBeInTheDocument();
    expect(
      screen.getByText("Requires classified categories & 3 complete months of history.")
    ).toBeInTheDocument();
  });
});

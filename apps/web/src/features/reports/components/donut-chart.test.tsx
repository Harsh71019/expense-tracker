import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DonutChart } from "./donut-chart";

describe("DonutChart", () => {
  it("renders the centre value and label, and one path per slice", () => {
    const { container, getByText } = render(
      <DonutChart
        slices={[
          { value: 30, color: "#f97316" },
          { value: 70, color: "#3b82f6" }
        ]}
        size={190}
        centerValue="₹8.5k"
        centerLabel="total spend"
      />
    );

    expect(getByText("₹8.5k")).toBeVisible();
    expect(getByText("total spend")).toBeVisible();
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("renders no paths for an empty series", () => {
    const { container } = render(
      <DonutChart slices={[]} size={190} centerValue="₹0" centerLabel="total spend" />
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PieChart } from "./pie-chart";

describe("PieChart", () => {
  it("renders one filled path per slice", () => {
    const { container } = render(
      <PieChart
        slices={[
          { value: 30, color: "#f97316" },
          { value: 70, color: "#3b82f6" }
        ]}
        size={190}
      />
    );

    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute("fill")).toBe("#f97316");
    expect(paths[0]?.getAttribute("stroke")).toBe("none");
  });

  it("renders no paths for an empty series", () => {
    const { container } = render(<PieChart slices={[]} size={190} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});

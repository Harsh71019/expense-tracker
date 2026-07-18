import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "./sparkline";

describe("Sparkline", () => {
  it("renders nothing for an empty series", () => {
    const { container } = render(<Sparkline values={[]} color="#34d399" width={88} height={42} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders an svg with a line and area path for a real series", () => {
    const { container } = render(
      <Sparkline values={[100, 200, 150]} color="#34d399" width={88} height={42} />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("88");
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("circle")).not.toBeNull();
  });
});

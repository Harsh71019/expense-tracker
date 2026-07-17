import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "../badge";

describe("Badge", () => {
  it("renders with dynamic variants and styles", () => {
    render(<Badge variant="reversed">Reversed</Badge>);
    expect(screen.getByText("Reversed")).toHaveClass("text-reversed");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("renders status and loading animated state", () => {
    render(<Skeleton data-testid="skeleton" className="h-4 w-8" />);
    expect(screen.getByTestId("skeleton")).toHaveClass("motion-reduce:animate-none");
  });
});

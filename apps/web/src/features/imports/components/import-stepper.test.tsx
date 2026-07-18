import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportStepper } from "./import-stepper";

describe("ImportStepper", () => {
  it("marks steps before the current one as done and labels every step", () => {
    render(<ImportStepper step={1} />);
    expect(screen.getByText("✓")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("Upload")).toBeVisible();
    expect(screen.getByText("Map columns")).toBeVisible();
    expect(screen.getByText("Review")).toBeVisible();
  });

  it("marks the current step with aria-current", () => {
    render(<ImportStepper step={2} />);
    const current = document.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    expect(current).toHaveTextContent("3");
  });
});

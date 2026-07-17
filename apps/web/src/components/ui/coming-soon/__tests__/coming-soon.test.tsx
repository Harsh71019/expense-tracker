import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ComingSoon } from "../coming-soon";

describe("ComingSoon", () => {
  it("identifies the unavailable feature and its delivery phase", () => {
    render(<ComingSoon title="Reports" phase="Phase 5" />);

    expect(screen.getByRole("heading", { name: "Reports" })).toBeVisible();
    expect(screen.getByText("Phase 5")).toBeVisible();
    expect(screen.getByText("Not posted to the ledger yet.")).toBeVisible();
  });
});

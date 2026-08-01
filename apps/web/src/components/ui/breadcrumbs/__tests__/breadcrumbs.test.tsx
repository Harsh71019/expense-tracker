import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "../breadcrumbs";

describe("Breadcrumbs", () => {
  it("links parent pages and marks the final item as current", () => {
    render(
      <Breadcrumbs
        items={[{ label: "Settings", href: "/settings?tab=management" }, { label: "Imports" }]}
      />
    );

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings?tab=management"
    );
    expect(within(breadcrumbs).getByText("Imports")).toHaveAttribute("aria-current", "page");
    expect(within(breadcrumbs).getByRole("link", { name: "Back to Settings" })).toHaveClass(
      "min-h-11",
      "sm:hidden"
    );
  });
});

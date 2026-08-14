import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageShell } from "../page-shell";

describe("PageShell", () => {
  it("applies the requested width while retaining the shared page rhythm", () => {
    render(
      <PageShell width="narrow">
        <p>Focused task</p>
      </PageShell>
    );

    expect(screen.getByText("Focused task").parentElement).toHaveClass(
      "mx-auto",
      "w-full",
      "space-y-6",
      "max-w-2xl"
    );
  });
});

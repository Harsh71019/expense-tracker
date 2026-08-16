import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProtectionDataNotice } from "./protection-data-notice";

describe("ProtectionDataNotice", () => {
  it("is a labelled region a screen reader can jump to", () => {
    render(<ProtectionDataNotice />);

    expect(
      screen.getByRole("region", { name: "What this section does, and does not, do" })
    ).toBeVisible();
  });

  it("states that the app does not sell or recommend policies", () => {
    render(<ProtectionDataNotice />);

    expect(
      screen.getByText(/does not sell insurance, recommend a policy or insurer/)
    ).toBeVisible();
  });

  it("states which sensitive data is deliberately not collected", () => {
    render(<ProtectionDataNotice />);

    expect(
      screen.getByText(/Never policy numbers, insurer logins, documents, or any medical detail/)
    ).toBeVisible();
  });

  it("states that cover never counts toward net worth", () => {
    render(<ProtectionDataNotice />);

    expect(
      screen.getByText(/never counted as an asset and never appears in your net worth/)
    ).toBeVisible();
  });

  it("states that not-sure stays visible as unknown", () => {
    render(<ProtectionDataNotice />);

    expect(screen.getByText(/rather than being quietly treated as covered/)).toBeVisible();
  });

  it("lays out for narrow screens before widening", () => {
    const { container } = render(<ProtectionDataNotice />);
    const section = container.querySelector("section");

    // Mobile-first padding that steps up at the sm breakpoint, never a fixed width.
    expect(section).toHaveClass("p-4");
    expect(section).toHaveClass("sm:p-5");
    expect(section?.className).not.toMatch(/\bw-\[/);
  });
});

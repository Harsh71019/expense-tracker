import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { Toaster } from "../sonner";

vi.mock("sonner", () => ({
  Toaster: ({
    position,
    closeButton,
    visibleToasts,
    containerAriaLabel,
    mobileOffset,
    toastOptions
  }: Readonly<{
    position?: string;
    closeButton?: boolean;
    visibleToasts?: number;
    containerAriaLabel?: string;
    mobileOffset?: Readonly<{ bottom?: string | number }>;
    toastOptions?: Readonly<{ closeButtonAriaLabel?: string }>;
  }>): ReactNode => (
    <div
      aria-label={containerAriaLabel}
      data-position={position}
      data-close-button={String(closeButton)}
      data-visible-toasts={visibleToasts}
      data-mobile-bottom={mobileOffset?.bottom}
      data-close-label={toastOptions?.closeButtonAriaLabel}
    />
  )
}));

describe("Toaster", () => {
  it("provides accessible, bounded, safe-area-aware defaults", () => {
    render(<Toaster />);

    const region = screen.getByLabelText("Application notifications");
    expect(region).toHaveAttribute("data-position", "bottom-right");
    expect(region).toHaveAttribute("data-close-button", "true");
    expect(region).toHaveAttribute("data-visible-toasts", "4");
    expect(region).toHaveAttribute(
      "data-mobile-bottom",
      "calc(env(safe-area-inset-bottom, 0px) + 88px)"
    );
    expect(region).toHaveAttribute("data-close-label", "Dismiss notification");
  });

  it("allows a route shell to override placement", () => {
    render(<Toaster position="top-center" />);

    expect(screen.getByLabelText("Application notifications")).toHaveAttribute(
      "data-position",
      "top-center"
    );
  });
});

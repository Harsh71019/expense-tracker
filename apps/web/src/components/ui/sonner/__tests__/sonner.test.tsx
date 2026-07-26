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
    toastOptions,
    theme,
    richColors,
    style
  }: Readonly<{
    position?: string;
    closeButton?: boolean;
    visibleToasts?: number;
    containerAriaLabel?: string;
    mobileOffset?: Readonly<{ bottom?: string | number }>;
    toastOptions?: Readonly<{
      closeButtonAriaLabel?: string;
      classNames?: Readonly<{ actionButton?: string }>;
    }>;
    theme?: string;
    richColors?: boolean;
    style?: Readonly<Record<string, string>>;
  }>): ReactNode => (
    <div
      aria-label={containerAriaLabel}
      data-position={position}
      data-close-button={String(closeButton)}
      data-visible-toasts={visibleToasts}
      data-mobile-bottom={mobileOffset?.bottom}
      data-close-label={toastOptions?.closeButtonAriaLabel}
      data-theme={theme}
      data-rich-colors={String(richColors)}
      data-normal-bg={style?.["--normal-bg"]}
      data-normal-border={style?.["--normal-border"]}
      data-info-text={style?.["--info-text"]}
      data-action-class={toastOptions?.classNames?.actionButton}
    />
  )
}));

describe("Toaster", () => {
  it("provides accessible, theme-aware, accent-aware defaults", () => {
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
    expect(region).toHaveAttribute("data-theme", "system");
    expect(region).toHaveAttribute("data-rich-colors", "true");
    expect(region).toHaveAttribute("data-normal-bg", "var(--color-surface-elevated)");
    expect(region).toHaveAttribute(
      "data-normal-border",
      "color-mix(in srgb, var(--color-accent) 28%, var(--color-border))"
    );
    expect(region).toHaveAttribute("data-info-text", "var(--color-accent)");
    expect(region).toHaveAttribute("data-action-class", expect.stringContaining("bg-accent"));
  });

  it("allows the root layout to supply an explicit theme and override placement", () => {
    render(<Toaster theme="dark" position="top-center" />);

    const region = screen.getByLabelText("Application notifications");
    expect(region).toHaveAttribute("data-theme", "dark");
    expect(region).toHaveAttribute("data-position", "top-center");
  });
});

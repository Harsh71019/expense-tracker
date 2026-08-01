"use client";

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

interface ThemedToastStyle extends CSSProperties {
  "--width": string;
  "--normal-bg": string;
  "--normal-bg-hover": string;
  "--normal-border": string;
  "--normal-border-hover": string;
  "--normal-text": string;
  "--success-bg": string;
  "--success-border": string;
  "--success-text": string;
  "--info-bg": string;
  "--info-border": string;
  "--info-text": string;
  "--warning-bg": string;
  "--warning-border": string;
  "--warning-text": string;
  "--error-bg": string;
  "--error-border": string;
  "--error-text": string;
}

const themedToastStyle: ThemedToastStyle = {
  "--width": "min(356px, calc(100vw - 24px))",
  "--normal-bg": "var(--color-surface-elevated)",
  "--normal-bg-hover": "var(--color-surface-muted)",
  "--normal-border": "color-mix(in srgb, var(--color-accent) 28%, var(--color-border))",
  "--normal-border-hover": "var(--color-accent)",
  "--normal-text": "var(--color-foreground)",
  "--success-bg": "color-mix(in srgb, var(--color-income) 10%, var(--color-surface-elevated))",
  "--success-border": "color-mix(in srgb, var(--color-income) 45%, var(--color-border))",
  "--success-text": "var(--color-income)",
  "--info-bg": "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-elevated))",
  "--info-border": "color-mix(in srgb, var(--color-accent) 45%, var(--color-border))",
  "--info-text": "var(--color-accent)",
  "--warning-bg": "color-mix(in srgb, var(--color-warning) 10%, var(--color-surface-elevated))",
  "--warning-border": "color-mix(in srgb, var(--color-warning) 45%, var(--color-border))",
  "--warning-text": "var(--color-warning)",
  "--error-bg": "color-mix(in srgb, var(--color-expense) 10%, var(--color-surface-elevated))",
  "--error-border": "color-mix(in srgb, var(--color-expense) 45%, var(--color-border))",
  "--error-text": "var(--color-expense)"
};

export function Toaster({ theme = "system", ...props }: Readonly<ToasterProps>): ReactNode {
  return (
    <Sonner
      className="toaster group"
      theme={theme}
      richColors
      style={themedToastStyle}
      position="bottom-right"
      closeButton
      expand={false}
      visibleToasts={4}
      gap={10}
      offset={{ right: 16, bottom: 16 }}
      mobileOffset={{
        right: 12,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
        left: 12
      }}
      containerAriaLabel="Application notifications"
      toastOptions={{
        closeButtonAriaLabel: "Dismiss notification",
        classNames: {
          toast:
            "group toast group-[.toaster]:shadow-sm group-[.toaster]:rounded-xl group-[.toaster]:px-4 group-[.toaster]:py-3.5 group-[.toaster]:font-sans",
          description:
            "group-[.toast]:text-foreground-muted group-[.toast]:text-xs group-[.toast]:mt-1",
          actionButton:
            "group-[.toast]:bg-accent group-[.toast]:text-accent-foreground group-[.toast]:font-bold group-[.toast]:text-[11px] group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 transition-colors hover:bg-accent-strong",
          cancelButton:
            "group-[.toast]:bg-surface-muted group-[.toast]:text-foreground-muted group-[.toast]:font-semibold group-[.toast]:text-[11px] group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 transition-colors hover:bg-surface-muted/80"
        }
      }}
      {...props}
    />
  );
}

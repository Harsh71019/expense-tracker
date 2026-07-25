"use client";

import type { ComponentProps, ReactNode } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: Readonly<ToasterProps>): ReactNode {
  // We let Tailwind CSS classes resolve dynamically, which handles theme shifts automatically.
  return (
    <Sonner
      className="toaster group"
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
            "group toast group-[.toaster]:bg-surface-elevated group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-sm group-[.toaster]:rounded-xl group-[.toaster]:px-4 group-[.toaster]:py-3.5 group-[.toaster]:font-sans",
          description:
            "group-[.toast]:text-foreground-muted group-[.toast]:text-xs group-[.toast]:mt-1",
          actionButton:
            "group-[.toast]:bg-accent group-[.toast]:text-accent-foreground group-[.toast]:font-bold group-[.toast]:text-[11px] group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 transition-colors hover:bg-accent-strong",
          cancelButton:
            "group-[.toast]:bg-surface-muted group-[.toast]:text-foreground-muted group-[.toast]:font-semibold group-[.toast]:text-[11px] group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 transition-colors hover:bg-surface-muted/80",
          success: "group-[.toast]:border-income/40 group-[.toast]:text-income",
          error: "group-[.toast]:border-expense/40 group-[.toast]:text-expense",
          warning: "group-[.toast]:border-orange-500/40 group-[.toast]:text-orange-500",
          info: "group-[.toast]:border-accent/40 group-[.toast]:text-accent"
        }
      }}
      {...props}
    />
  );
}

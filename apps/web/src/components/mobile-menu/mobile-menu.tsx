"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { Theme } from "@/lib/theme";

import { AppNav, mainNavItems } from "../app-nav";
import { ThemeToggle } from "../ui/theme-toggle";

export function MobileMenu({
  email,
  theme
}: Readonly<{ email: string; theme: Theme | null }>): ReactNode {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeMenu(): void {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={menuButtonRef}
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(true)}
        className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-xl border border-border/60 bg-surface-muted/40 text-foreground transition-colors hover:border-border hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
      >
        <Menu size={19} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="fixed inset-0 z-50 flex h-dvh flex-col bg-surface-elevated md:hidden"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
            <div>
              <p className="text-base font-bold tracking-tight text-foreground">TreasuryOps</p>
              <p className="mt-1 font-mono text-2xs font-bold tracking-[0.18em] text-accent uppercase">
                Expense tracker
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close navigation"
              onClick={closeMenu}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
            <p className="mb-3 px-3 font-mono text-2xs font-bold tracking-[0.18em] text-foreground-muted uppercase">
              Navigate
            </p>
            <AppNav items={mainNavItems} orientation="sidebar" onNavigate={closeMenu} />
          </div>

          <div className="safe-area-bottom shrink-0 border-t border-border bg-surface px-5 pt-4">
            <p className="truncate text-sm font-semibold text-foreground">{email}</p>
            <p className="mt-1 text-xs text-foreground-muted">Signed in</p>
            <div className="mt-3">
              <ThemeToggle current={theme} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

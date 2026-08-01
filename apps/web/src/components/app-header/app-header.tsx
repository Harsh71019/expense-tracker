"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CreateTxnSheet } from "@/features/transactions/components/create-txn-sheet";
import { usePrivacy } from "@/lib/privacy/privacy-context";
import type { Theme } from "@/lib/theme";

import { MobileMenu } from "../mobile-menu";

const routeLabels: Record<string, { label: string; icon?: string }> = {
  "/": { label: "Dashboard", icon: "⌂" },
  "/accounts": { label: "Accounts", icon: "▣" },
  "/insights": { label: "Insights", icon: "✦" },
  "/transactions": { label: "Transactions", icon: "≡" },
  "/transfers": { label: "Transfers", icon: "⤢" },
  "/categories": { label: "Categories", icon: "▤" },
  "/category-rules": { label: "Category Rules", icon: "⌁" },
  "/imports": { label: "Imports", icon: "↥" },
  "/assets": { label: "Assets", icon: "◈" },
  "/goals": { label: "Goals", icon: "◎" },
  "/budgets": { label: "Budgets", icon: "◫" },
  "/reports": { label: "Reports", icon: "◔" },
  "/spending-warnings": { label: "Patterns", icon: "△" },
  "/settings": { label: "Settings" }
};

export function AppHeader({
  email,
  theme
}: Readonly<{ email: string; theme: Theme | null }>): ReactNode {
  const pathname = usePathname() ?? "/";
  const { privacyMode, togglePrivacyMode } = usePrivacy();
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [currentDate, setCurrentDate] = useState("");
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    function updateClock(): void {
      const now = new Date();
      const dateFormatted = new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Kolkata"
      }).format(now);
      const timeFormatted = new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata"
      }).format(now);

      setCurrentDate(dateFormatted);
      setCurrentTime(timeFormatted);
    }

    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  // Global keyboard shortcut (⌘N or Alt+N to open new entry sheet)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setShowCreateSheet((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const parentRoute = Object.keys(routeLabels).find(
    (route) => route !== "/" && pathname.startsWith(`${route}/`)
  );
  const routeInfo = routeLabels[pathname] ??
    (parentRoute === undefined ? undefined : routeLabels[parentRoute]) ?? {
      label: pathname.slice(1).charAt(0).toUpperCase() + pathname.slice(2),
      icon: "❖"
    };
  const PrivacyIcon = privacyMode ? EyeOff : Eye;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-2 border-b border-border/60 bg-surface/90 px-3 backdrop-blur-md transition-colors sm:px-6">
        {/* Left: Breadcrumbs & Current Page Indicator */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MobileMenu email={email} theme={theme} />

          <Link
            href="/"
            className="hidden items-center gap-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground sm:flex"
          >
            <span className="font-mono text-sm text-accent">₹</span>
            <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-wider">
              TreasuryOps
            </span>
          </Link>

          <span className="hidden font-mono text-xs text-foreground-muted/40 sm:inline">/</span>

          <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/50 bg-surface-muted/60 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs">
            {routeInfo.icon === undefined ? null : (
              <span className="text-accent text-sm" aria-hidden="true">
                {routeInfo.icon}
              </span>
            )}
            <span className="truncate">{routeInfo.label}</span>
          </div>

          {currentDate !== "" && (
            <div className="hidden lg:flex items-center gap-1.5 ml-2 font-mono text-[11px] text-foreground-muted/80 bg-surface-muted/30 px-2.5 py-1 rounded-lg border border-border/40">
              <span>{currentDate}</span>
              <span className="text-foreground-muted/40">·</span>
              <span className="font-semibold text-foreground-muted">{currentTime} IST</span>
            </div>
          )}
        </div>

        {/* Right: Actions, Privacy Mode Toggle, Quick Add & Shortcuts */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Privacy Toggle */}
          <button
            type="button"
            onClick={togglePrivacyMode}
            title={privacyMode ? "Disable privacy mode" : "Enable privacy mode (hide balances)"}
            aria-label={privacyMode ? "Disable privacy mode" : "Enable privacy mode"}
            className={`flex h-11 w-11 touch-manipulation items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-95 sm:w-auto sm:px-3 ${
              privacyMode
                ? "border-accent/40 bg-accent-glow text-accent font-semibold shadow-xs"
                : "border-border/60 bg-surface-muted/40 text-foreground-muted hover:border-border hover:text-foreground"
            }`}
          >
            <PrivacyIcon size={16} strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">{privacyMode ? "Privacy Mode" : "Privacy"}</span>
          </button>

          {/* Quick Add Entry Button */}
          <Button
            onClick={() => setShowCreateSheet(true)}
            className="hidden items-center gap-1.5 shadow-xs transition-transform active:scale-[0.98] sm:inline-flex"
            title="Post a new transaction (⌘N)"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span className="hidden xs:inline">New Entry</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-accent-foreground/20 bg-accent-foreground/10 px-1 font-mono text-[10px] opacity-80">
              ⌘N
            </kbd>
          </Button>
        </div>
      </header>

      {/* Quick Add Sheet Drawer Modal */}
      {showCreateSheet && <CreateTxnSheet onClose={() => setShowCreateSheet(false)} />}
    </>
  );
}

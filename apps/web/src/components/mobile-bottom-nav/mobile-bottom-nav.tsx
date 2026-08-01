"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { CreateTxnSheet } from "@/features/transactions/components/create-txn-sheet";

const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/transactions", label: "Transactions", icon: "≡" },
  { href: "/reports", label: "Reports", icon: "◔" },
  { href: "/more", label: "More", icon: "∷" }
] as const;

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function MobileBottomNav(): ReactNode {
  const pathname = usePathname() ?? "/";
  const [createOpen, setCreateOpen] = useState(false);
  const firstItems = MOBILE_NAV_ITEMS.slice(0, 2);
  const lastItems = MOBILE_NAV_ITEMS.slice(2);

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface-elevated/95 px-2 pt-1.5 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {firstItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
              className={`flex min-h-14 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isActiveRoute(pathname, item.href)
                  ? "text-accent"
                  : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {item.icon}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          ))}

          <button
            type="button"
            aria-label="Add transaction"
            aria-haspopup="dialog"
            onClick={() => setCreateOpen(true)}
            className="group flex min-h-14 touch-manipulation flex-col items-center justify-end gap-0.5 rounded-xl text-[10px] font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="grid h-13 w-13 -translate-y-2 place-items-center rounded-2xl border-4 border-surface-elevated bg-accent text-2xl font-semibold leading-none text-accent-foreground shadow-glow-strong transition-transform duration-150 group-active:translate-y-[-6px] group-active:scale-95">
              <span aria-hidden="true">+</span>
            </span>
            <span className="-mt-2">Add</span>
          </button>

          {lastItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
              className={`flex min-h-14 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isActiveRoute(pathname, item.href)
                  ? "text-accent"
                  : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {item.icon}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {createOpen ? <CreateTxnSheet onClose={() => setCreateOpen(false)} /> : null}
    </>
  );
}

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/transactions", label: "Transactions" },
  { href: "/add", label: "Add" },
  { href: "/reports", label: "Reports" },
  { href: "/more", label: "More" }
] as const;

export default async function AppLayout({
  children
}: Readonly<{ children: ReactNode }>): Promise<ReactNode> {
  const [session, theme] = await Promise.all([getSession(), getStoredTheme()]);
  if (session === null) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-border p-4 md:flex">
        <div className="flex flex-col gap-6">
          <div>
            <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground uppercase">
              Vyaya
            </span>
            <div className="mt-2 h-px w-8 bg-accent" aria-hidden="true" />
          </div>
          <AppNav items={navItems} orientation="sidebar" />
        </div>
        <div className="flex flex-col gap-3">
          <ThemeToggle current={theme} />
          <span className="truncate text-xs text-foreground-muted">{session.user.email}</span>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground uppercase">
            Vyaya
          </span>
          <ThemeToggle current={theme} />
        </header>

        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>

        <div className="fixed inset-x-0 bottom-0 md:hidden">
          <AppNav items={navItems} orientation="bottom" />
        </div>
      </div>
    </div>
  );
}

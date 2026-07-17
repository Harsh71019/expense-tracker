import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

const navItems = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/transactions", label: "Transactions", icon: "≡" },
  { href: "/add", label: "Add", icon: "+" },
  { href: "/reports", label: "Reports", icon: "◔" },
  { href: "/more", label: "More", icon: "•••" }
] as const;

export default async function AppLayout({
  children
}: Readonly<{ children: ReactNode }>): Promise<ReactNode> {
  const [session, theme] = await Promise.all([getSession(), getStoredTheme()]);
  if (session === null) {
    redirect("/login");
  }

  return (
    <div className="relative min-h-screen bg-surface md:flex">
      <AppSidebar email={session.user.email} theme={theme} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface-elevated px-5 py-4 md:hidden">
          <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground uppercase">
            Vyaya
          </span>
          <ThemeToggle current={theme} />
        </header>

        <main className="w-full flex-1 p-5 pb-24 sm:p-8 md:pb-8 animate-fade-in">{children}</main>

        <div className="fixed bottom-4 inset-x-4 z-10 rounded-xl border border-border bg-surface-elevated shadow-sm md:hidden">
          <AppNav items={navItems} orientation="bottom" />
        </div>
      </div>
    </div>
  );
}

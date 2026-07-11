import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth";
import { getSession } from "@/lib/api/session";

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
  const session = await getSession();
  if (session === null) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-border p-4 md:flex">
        <div className="flex flex-col gap-1">
          <span className="mb-4 px-2 text-lg font-semibold">Vyaya</span>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-2 text-sm hover:bg-surface-muted"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2 px-2">
          <span className="truncate text-xs text-foreground-muted">{session.user.email}</span>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 flex border-t border-border bg-surface md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-foreground-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

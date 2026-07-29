import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

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
        <AppHeader email={session.user.email} theme={theme} />

        <main className="w-full flex-1 p-5 sm:p-8 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

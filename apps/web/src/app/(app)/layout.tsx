import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header/app-header";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
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
    <>
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform duration-150 focus:translate-y-0"
      >
        Skip to content
      </a>
      <div className="relative min-h-dvh bg-surface md:flex">
        <AppSidebar email={session.user.email} theme={theme} />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader email={session.user.email} theme={theme} />

          <main
            id="main-content"
            className="app-main-mobile-padding w-full flex-1 p-4 sm:p-8 animate-fade-in"
          >
            {children}
          </main>
        </div>

        <MobileBottomNav />
      </div>
    </>
  );
}

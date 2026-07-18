import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { getStoredTheme } from "../lib/theme-server";
import { QueryProvider } from "../lib/query/provider";
import { Toaster } from "../components/ui/sonner";
import { MockApiBoot } from "../mocks/MockApiBoot";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono"
});

export const metadata: Metadata = {
  title: "Vyaya",
  description: "Personal expense tracker"
};

export default async function RootLayout({
  children
}: Readonly<{ children: ReactNode }>): Promise<ReactNode> {
  const theme = await getStoredTheme();

  return (
    <html
      lang="en-IN"
      data-theme={theme ?? undefined}
      className={`${interTight.variable} ${jetbrainsMono.variable}`}
    >
      {/* ColorZilla injects cz-shortcut-listen on body before React hydrates. */}
      <body suppressHydrationWarning className="bg-surface font-sans text-foreground antialiased">
        <QueryProvider>
          {children}
          <Toaster />
          <MockApiBoot />
        </QueryProvider>
      </body>
    </html>
  );
}

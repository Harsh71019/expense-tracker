import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { getStoredTheme } from "../lib/theme-server";
import { QueryProvider } from "../lib/query/provider";
import { Toaster } from "../components/ui/sonner";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans"
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono"
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
      className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
    >
      {/* ColorZilla injects cz-shortcut-listen on body before React hydrates. */}
      <body suppressHydrationWarning className="bg-surface font-sans text-foreground antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}

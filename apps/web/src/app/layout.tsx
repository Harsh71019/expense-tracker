import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { getStoredTheme } from "../lib/theme-server";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk"
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
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body className="bg-surface font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}

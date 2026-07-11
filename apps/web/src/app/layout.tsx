import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vyaya",
  description: "Personal expense tracker"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html lang="en-IN">
      <body className="bg-surface text-foreground antialiased">{children}</body>
    </html>
  );
}

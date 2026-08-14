import type { ReactNode } from "react";

const pageShellWidths = {
  wide: "max-w-7xl",
  standard: "max-w-6xl",
  narrow: "max-w-2xl"
} as const;

export type PageShellWidth = keyof typeof pageShellWidths;

export function PageShell({
  children,
  width = "standard",
  className
}: Readonly<{
  children: ReactNode;
  width?: PageShellWidth;
  className?: string;
}>): ReactNode {
  return (
    <div className={`mx-auto w-full space-y-6 ${pageShellWidths[width]} ${className ?? ""}`}>
      {children}
    </div>
  );
}

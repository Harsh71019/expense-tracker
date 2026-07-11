import type { ReactNode } from "react";

export default function NotFound(): ReactNode {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <a href="/" className="text-sm text-foreground-muted underline">
        Back to Vyaya
      </a>
    </div>
  );
}

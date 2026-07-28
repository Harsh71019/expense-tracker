import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";

export function WarningEmptyState({
  variant
}: Readonly<{ variant: "no-warnings" | "filtered" }>): ReactNode {
  if (variant === "filtered") {
    return (
      <EmptyState
        title="No spending patterns match this filter"
        description="Try a different filter to see the rest of your recent analysis."
        action={
          <Link
            href="/spending-warnings"
            className="text-sm font-semibold text-accent hover:underline"
          >
            Show all
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      title="No unusual spending patterns right now"
      description="This compares your recent posted expenses against your own history — it isn't a statement that your spending is safe or risk-free, just that nothing stood out this time."
    />
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function TransactionsLoading(): ReactNode {
  return (
    <div className="mx-auto max-w-3xl rounded-md border border-border bg-surface-elevated px-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center justify-between border-b border-border py-4 last:border-b-0"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

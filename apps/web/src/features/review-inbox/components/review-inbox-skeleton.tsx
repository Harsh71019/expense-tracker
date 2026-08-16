import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui";

export function ReviewInboxSkeleton(): ReactNode {
  return (
    <div
      data-testid="review-inbox-skeleton"
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading review inbox items"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>

      <div className="space-y-3 pt-2">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export default function AccountDetailLoading(): ReactNode {
  return (
    <section aria-label="Loading account details" className="mx-auto w-full max-w-7xl space-y-6">
      <Skeleton className="h-11 w-48" />
      <Skeleton className="h-72 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.8fr_0.8fr]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </section>
  );
}

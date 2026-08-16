import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export default function CashflowForecastLoading(): ReactNode {
  return (
    <section aria-label="Loading cash-flow forecast" className="space-y-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-5 w-full max-w-2xl" />
      <Skeleton className="h-11 w-48" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </section>
  );
}

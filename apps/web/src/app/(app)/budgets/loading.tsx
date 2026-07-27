import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function BudgetsLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-56" />
      </header>

      <Skeleton className="h-28 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

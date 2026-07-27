import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function DashboardLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-9 w-72" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>

      <Skeleton className="h-48 w-full rounded-xl" />
    </section>
  );
}

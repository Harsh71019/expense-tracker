import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function ReportsLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-9 w-56" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg" />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </section>
  );
}

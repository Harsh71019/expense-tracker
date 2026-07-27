import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function CategoriesLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-56" />
      </header>

      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

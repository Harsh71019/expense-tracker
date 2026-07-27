import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function ImportsLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-56" />
      </header>

      <Skeleton className="h-10 w-full max-w-md rounded-lg" />

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

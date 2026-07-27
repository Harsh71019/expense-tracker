import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function CategoryRulesLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-56" />
      </header>

      <div className="rounded-xl border border-border bg-surface-elevated px-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between border-b border-border py-4 last:border-b-0"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      <Skeleton className="h-32 w-full rounded-xl" />
    </section>
  );
}

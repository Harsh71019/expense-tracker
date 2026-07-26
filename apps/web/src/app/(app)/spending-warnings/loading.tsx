import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function SpendingWarningsLoading(): ReactNode {
  return (
    <section className="mx-auto max-w-3xl">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <Skeleton className="mt-6 h-20 w-full rounded-xl" />
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

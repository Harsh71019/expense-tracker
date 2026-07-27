import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function AssetsLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <Skeleton className="h-32 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

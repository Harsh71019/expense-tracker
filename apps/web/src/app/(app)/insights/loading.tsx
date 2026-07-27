import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function InsightsLoading(): ReactNode {
  return (
    <section className="flex flex-col gap-5">
      <Skeleton className="h-40 w-full rounded-xl" />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>

      <Skeleton className="h-48 w-full rounded-xl" />
    </section>
  );
}

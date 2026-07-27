import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export default function SettingsLoading(): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <header className="mb-1">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-9 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
      </header>

      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={["animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

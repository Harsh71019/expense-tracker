import type { HTMLAttributes, ReactNode } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={[
        "animate-pulse rounded-lg bg-gradient-to-r from-surface-muted via-surface-elevated/50 to-surface-muted motion-reduce:animate-none",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

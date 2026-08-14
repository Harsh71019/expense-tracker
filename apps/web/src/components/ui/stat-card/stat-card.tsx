import type { ElementType, HTMLAttributes, ReactNode } from "react";

const paddingClasses = {
  xs: "p-4 sm:p-5",
  sm: "p-4.5 sm:p-5",
  md: "p-5"
} as const;

type StatCardProps = Readonly<{
  as?: ElementType;
  hoverable?: boolean;
  padding?: keyof typeof paddingClasses;
  children: ReactNode;
}> &
  Omit<HTMLAttributes<HTMLElement>, "children">;

export function StatCard({
  as: Tag = "article",
  hoverable = true,
  padding = "md",
  className,
  children,
  ...props
}: StatCardProps): ReactNode {
  return (
    <Tag
      className={[
        "glass-card min-w-0 rounded-2xl",
        paddingClasses[padding],
        hoverable ? "glass-card-hover" : "",
        className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function StatCardLabel({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>): ReactNode {
  return (
    <p
      className={[
        "font-mono text-2xs font-bold tracking-[0.14em] text-foreground-muted uppercase",
        className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}

export function StatCardValue({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>): ReactNode {
  return (
    <p
      className={[
        "mt-2.5 font-mono text-3xl font-bold tracking-tight text-foreground",
        className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}

import type { ReactNode } from "react";
import { formatMinor, type MinorAmount } from "@vyaya/shared";

type MoneyVariant = "income" | "expense" | "neutral";

type MoneyProps = {
  minor: MinorAmount;
  variant?: MoneyVariant;
  signed?: boolean;
  className?: string;
};

const variantClasses: Record<MoneyVariant, string> = {
  income: "text-income",
  expense: "text-expense",
  neutral: "text-foreground"
};

const signPrefix: Record<MoneyVariant, string> = {
  income: "+",
  expense: "−",
  neutral: ""
};

export function Money({
  minor,
  variant = "neutral",
  signed = false,
  className
}: MoneyProps): ReactNode {
  const prefix = signed ? signPrefix[variant] : "";
  const classes = ["tabular-nums", variantClasses[variant], className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {prefix}
      {formatMinor(minor)}
    </span>
  );
}

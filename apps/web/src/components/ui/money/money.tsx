import type { ReactNode } from "react";
import { formatMinor, type MinorAmount } from "@treasury-ops/shared";

import { usePrivacy } from "@/lib/privacy/privacy-context";

type MoneyVariant = "income" | "expense" | "neutral";
type MoneySize = "sm" | "md" | "lg" | "hero";

type MoneyProps = {
  minor: MinorAmount;
  variant?: MoneyVariant;
  signed?: boolean;
  size?: MoneySize;
  className?: string;
  ignorePrivacy?: boolean;
};

type SignedMoneyProps = Omit<MoneyProps, "minor" | "variant" | "signed"> & {
  minor: number;
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

const sizeClasses: Record<MoneySize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  hero: "text-4xl sm:text-5xl"
};

export function Money({
  minor,
  variant = "neutral",
  signed = false,
  size = "md",
  className,
  ignorePrivacy = false
}: MoneyProps): ReactNode {
  const { privacyMode } = usePrivacy();
  const prefix = signed ? signPrefix[variant] : "";
  const classes = [
    "font-mono font-semibold tabular-nums",
    sizeClasses[size],
    variantClasses[variant],
    className
  ]
    .filter(Boolean)
    .join(" ");

  if (privacyMode && !ignorePrivacy) {
    return (
      <span className={classes} aria-label="Amount hidden in privacy mode">
        {`${prefix}₹ ••••••`}
      </span>
    );
  }

  return <span className={classes}>{`${prefix}${formatMinor(minor)}`}</span>;
}

export function SignedMoney({ minor, size, className }: SignedMoneyProps): ReactNode {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError("Signed amount must be a safe integer in paise.");
  }
  const variant: MoneyVariant = minor < 0 ? "expense" : minor > 0 ? "income" : "neutral";
  return (
    <Money
      minor={Math.abs(minor)}
      variant={variant}
      signed={minor !== 0}
      {...(size === undefined ? {} : { size })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

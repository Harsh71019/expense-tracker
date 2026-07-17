import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-strong",
  secondary:
    "border border-border bg-surface-elevated text-foreground hover:border-accent/50 hover:text-accent"
};

export function Button({ variant = "primary", className, ...props }: ButtonProps): ReactNode {
  const classes = [
    "rounded-lg px-4 py-2.5 text-sm font-semibold tracking-tight transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    className
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}

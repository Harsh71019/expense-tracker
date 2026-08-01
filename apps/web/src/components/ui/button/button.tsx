import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-strong",
  secondary:
    "border border-border bg-surface-elevated text-foreground hover:border-accent/50 hover:text-accent",
  ghost: "bg-transparent text-foreground-muted hover:bg-surface-muted hover:text-foreground",
  danger: "bg-expense text-white hover:bg-expense/90",
  outline: "border border-border bg-transparent text-foreground hover:bg-surface-muted"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base"
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  children,
  ...props
}: ButtonProps): ReactNode {
  const classes = [
    "min-h-11 touch-manipulation rounded-lg px-4 py-2.5 text-sm font-semibold tracking-tight transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "" : sizeClasses[size],
    variantClasses[variant],
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={props.type ?? "button"}
      className={classes}
      disabled={props.disabled || isLoading}
      aria-busy={isLoading ? true : undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <span
            className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          <span className="sr-only">Loading</span>
        </>
      ) : null}
      {children}
    </button>
  );
}

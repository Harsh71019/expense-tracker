import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-surface hover:opacity-90",
  secondary: "border border-border text-foreground hover:bg-surface-muted"
};

export function Button({ variant = "primary", className, ...props }: ButtonProps): ReactNode {
  const classes = [
    "rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50",
    variantClasses[variant],
    className
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}

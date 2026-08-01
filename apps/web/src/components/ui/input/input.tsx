import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
};

export function Input({ id, label, error, className, ...props }: InputProps): ReactNode {
  const errorId = `${id}-error`;
  const classes = [
    "min-h-11 w-full rounded-lg border bg-surface px-3.5 py-2.5 text-base text-foreground sm:text-sm",
    error ? "border-expense" : "border-border",
    "placeholder:text-foreground-muted/50",
    "transition-colors duration-150 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : props["aria-describedby"]}
        {...props}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs font-medium text-expense"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

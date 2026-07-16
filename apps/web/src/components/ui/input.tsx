import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
};

export function Input({ id, label, className, ...props }: InputProps): ReactNode {
  const classes = [
    "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground",
    "placeholder:text-foreground-muted/60",
    "transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium tracking-wide text-foreground-muted uppercase"
      >
        {label}
      </label>
      <input id={id} className={classes} {...props} />
    </div>
  );
}

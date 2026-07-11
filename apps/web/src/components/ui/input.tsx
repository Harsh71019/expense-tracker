import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
};

export function Input({ id, label, className, ...props }: InputProps): ReactNode {
  const classes = [
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground-muted">
        {label}
      </label>
      <input id={id} className={classes} {...props} />
    </div>
  );
}

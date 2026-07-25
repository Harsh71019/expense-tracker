"use client";

import { useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

type PasswordFieldProps = Readonly<{
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  onChange: (value: string) => void;
  minLength?: number;
  maxLength?: number;
  ariaDescribedBy?: string;
  isInvalid?: boolean;
}>;

export function PasswordField({
  id,
  label,
  value,
  autoComplete,
  onChange,
  minLength,
  maxLength,
  ariaDescribedBy,
  isInvalid = false
}: PasswordFieldProps): ReactNode {
  const [isRevealed, setIsRevealed] = useState(false);

  function updateValue(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
      >
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-border bg-surface pr-1.5 transition-colors duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
        <input
          id={id}
          name={id}
          type={isRevealed ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={updateValue}
          minLength={minLength}
          maxLength={maxLength}
          required
          aria-describedby={ariaDescribedBy}
          aria-invalid={isInvalid}
          className="w-full min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground-muted/50"
        />
        <button
          type="button"
          onClick={() => setIsRevealed((current) => !current)}
          aria-label={`${isRevealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {isRevealed ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export type SelectOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

export type SelectProps = Readonly<{
  options: readonly SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}>;

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  "aria-label": ariaLabel,
  name,
  id,
  disabled = false,
  className
}: SelectProps): ReactNode {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(event: MouseEvent): void {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current !== null &&
        !containerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listboxRef.current !== null) {
      const optionElement = listboxRef.current.children.item(focusedIndex);
      if (optionElement instanceof HTMLElement) {
        optionElement.scrollIntoView?.({ block: "nearest" });
      }
    }
  }, [isOpen, focusedIndex]);

  function toggleOpen(): void {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      const idx = options.findIndex((opt) => opt.value === value);
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  }

  function handleSelect(optionValue: string): void {
    onChange(optionValue);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement | HTMLUListElement>): void {
    if (disabled) return;

    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setIsOpen(true);
        const idx = options.findIndex((opt) => opt.value === value);
        setFocusedIndex(idx >= 0 ? idx : 0);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev + 1;
          while (next < options.length && options[next]?.disabled) {
            next++;
          }
          return next < options.length ? next : prev;
        });
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && options[next]?.disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          const opt = options[focusedIndex];
          if (opt && !opt.disabled) {
            handleSelect(opt.value);
          }
        }
        break;
      }
      case "Escape":
      case "Tab": {
        setIsOpen(false);
        break;
      }
    }
  }

  const triggerClasses = [
    "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-base font-medium text-foreground outline-none transition-colors duration-150 sm:text-sm",
    "hover:border-accent/50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className="relative w-full min-w-[160px] sm:w-auto">
      {name !== undefined ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        className={triggerClasses}
      >
        <span
          className={selectedOption ? "truncate text-foreground" : "truncate text-foreground-muted"}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-foreground-muted transition-transform duration-150 ${
            isOpen ? "rotate-180 text-accent" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <ul
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel ?? "Options"}
          className="custom-scrollbar animate-fade-in absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface-elevated p-1 shadow-lg backdrop-blur-md"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isFocused = index === focusedIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) {
                    handleSelect(option.value);
                  }
                }}
                onMouseEnter={() => {
                  if (!option.disabled) {
                    setFocusedIndex(index);
                  }
                }}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                  option.disabled ? "cursor-not-allowed opacity-40" : ""
                } ${
                  isSelected
                    ? "bg-accent/10 font-semibold text-accent"
                    : isFocused
                      ? "bg-surface-muted text-foreground"
                      : "text-foreground-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Check size={14} className="shrink-0 text-accent" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

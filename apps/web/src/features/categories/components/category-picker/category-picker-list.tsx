"use client";

import type { Category } from "@treasury-ops/shared";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { IconGlyph } from "../icon-glyph";
import { glyphFor, tint } from "../../model/palette";

export type PickerListOption = Readonly<{
  id: string;
  categoryId: string | undefined;
  label: string;
  indent: boolean;
  category?: Category;
}>;

type CategoryPickerListProps = Readonly<{
  type: "expense" | "income";
  options: readonly PickerListOption[];
  selectedId: string | undefined;
  activeOptionId: string;
  onSelect: (categoryId: string | undefined) => void;
  onFocusOption: (optionId: string) => void;
}>;

export function categoryOptionId(categoryId: string): string {
  return `cat:${categoryId}`;
}

export const UNCATEGORIZED_OPTION_ID = "uncategorized";

export function CategoryPickerList({
  type,
  options,
  selectedId,
  activeOptionId,
  onSelect,
  onFocusOption
}: CategoryPickerListProps): ReactNode {
  return (
    <div className="space-y-1">
      <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
        {type === "expense" ? "All expense categories" : "All income categories"}
      </p>
      <ul className="max-h-64 overflow-y-auto overscroll-contain">
        {options.map((option) => {
          const selected =
            option.categoryId === undefined
              ? selectedId === undefined
              : selectedId === option.categoryId;
          const active = activeOptionId === option.id;
          const color = option.category?.color ?? "#64748b";
          return (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                id={option.id}
                aria-label={option.label}
                aria-selected={selected}
                onMouseEnter={() => onFocusOption(option.id)}
                onClick={() => onSelect(option.categoryId)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150 motion-reduce:transition-none ${
                  option.indent ? "pl-7" : ""
                } ${
                  selected
                    ? "bg-accent/10 text-foreground"
                    : active
                      ? "bg-surface-muted"
                      : "text-foreground"
                }`}
              >
                {option.category === undefined ? (
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-muted text-xs text-foreground-muted"
                  >
                    ∅
                  </span>
                ) : (
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs"
                    style={{ backgroundColor: tint(color, 0.18), color }}
                  >
                    <IconGlyph value={glyphFor(option.category)} size={14} />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? <Check size={16} className="shrink-0 text-accent" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

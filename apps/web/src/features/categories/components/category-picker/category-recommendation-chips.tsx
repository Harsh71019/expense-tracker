"use client";

import type { Category, CategoryRecommendation } from "@treasury-ops/shared";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { IconGlyph } from "../icon-glyph";
import { glyphFor, tint } from "../../model/palette";
import {
  recommendationReasonCopy,
  recommendationReasonDetail
} from "../../model/recommendation-copy";

type CategoryRecommendationChipsProps = Readonly<{
  recommendations: readonly CategoryRecommendation[];
  categoriesById: ReadonlyMap<string, Category>;
  selectedId: string | undefined;
  activeOptionId: string;
  onSelect: (categoryId: string) => void;
  onFocusOption: (optionId: string) => void;
}>;

export function recommendationOptionId(categoryId: string): string {
  return `rec:${categoryId}`;
}

export function CategoryRecommendationChips({
  recommendations,
  categoriesById,
  selectedId,
  activeOptionId,
  onSelect,
  onFocusOption
}: CategoryRecommendationChipsProps): ReactNode {
  if (recommendations.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
        Recommended for you
      </p>
      <div className="flex flex-wrap gap-2">
        {recommendations.map((item) => {
          const category = categoriesById.get(item.categoryId);
          if (category === undefined) return null;
          const optionId = recommendationOptionId(item.categoryId);
          const selected = selectedId === item.categoryId;
          const active = activeOptionId === optionId;
          const color = category.color ?? "#64748b";
          return (
            <button
              key={optionId}
              type="button"
              role="option"
              id={optionId}
              aria-selected={selected}
              aria-label={`${category.name}, ${recommendationReasonDetail(item.reason, item.evidenceCount)}`}
              onMouseEnter={() => onFocusOption(optionId)}
              onClick={() => onSelect(item.categoryId)}
              className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-[border-color,background-color] duration-150 motion-reduce:transition-none ${
                selected
                  ? "border-accent bg-accent/10 text-foreground"
                  : active
                    ? "border-accent/60 bg-surface-muted"
                    : "border-border bg-surface-elevated"
              }`}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
                style={{ backgroundColor: tint(color, 0.18), color }}
              >
                <IconGlyph value={glyphFor(category)} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {category.name}
                </span>
                <span className="block truncate text-xs text-foreground-muted">
                  {recommendationReasonCopy(item.reason)}
                </span>
              </span>
              {selected ? <Check size={16} className="ml-auto shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

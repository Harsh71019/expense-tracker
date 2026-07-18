"use client";

import type { Category } from "@vyaya/shared";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, lighten, tint } from "../model/palette";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata"
});

function swatchStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return {
    background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${color})`,
    boxShadow: `0 8px 20px ${tint(color, 0.4)}, inset 0 1px 0 rgba(255,255,255,0.25)`
  };
}

type CategoryCardProps = Readonly<{
  parent: Category;
  subcategories: readonly Category[];
  onArchive: (category: Category) => void;
}>;

export function CategoryCard({ parent, subcategories, onArchive }: CategoryCardProps): ReactNode {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-border bg-surface-elevated p-5.5 shadow-sm animate-fade-in">
      <div className="flex items-start gap-4">
        <div
          style={swatchStyle(parent.color)}
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-[17px] text-2xl font-semibold ${
            parent.color === undefined
              ? "bg-accent text-accent-foreground shadow-glow"
              : "text-white"
          }`}
          aria-hidden="true"
        >
          {glyphFor(parent)}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="truncate text-xl font-bold tracking-tight text-foreground">
            {parent.name}
          </h3>
          <p className="mt-1 text-[12.5px] font-medium text-foreground-muted">
            {subcategories.length > 0
              ? `${subcategories.length} subcategor${subcategories.length === 1 ? "y" : "ies"}`
              : "Top-level category"}
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11.5px] text-foreground-muted">
            <span aria-hidden="true">🕘</span> Created {dateFormatter.format(parent.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onArchive(parent)}
          title="Archive"
          aria-label={`Archive ${parent.name}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-xs text-foreground-muted transition-colors duration-150 hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {subcategories.length === 0 ? null : (
        <div className="mt-4.5 flex flex-wrap gap-2 border-t border-border pt-4.5">
          {subcategories.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onArchive(child)}
              title={`Created ${dateFormatter.format(child.createdAt)} · click to archive`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted py-1.5 pr-2.5 pl-1.5 text-[13px] font-semibold text-foreground transition-colors duration-150 hover:border-accent/40"
            >
              <span
                style={swatchStyle(child.color)}
                className={`grid h-5.5 w-5.5 place-items-center rounded-full text-xs ${
                  child.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
                }`}
                aria-hidden="true"
              >
                {glyphFor(child)}
              </span>
              <span>{child.name}</span>
              <span className="text-[10px] text-foreground-muted">✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import type { Category } from "@treasury-ops/shared";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, lighten, tint } from "../model/palette";
import { IconGlyph } from "./icon-glyph";

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
  categories?: readonly Category[];
  onEdit?: (category: Category) => void;
  onArchive: (category: Category) => void;
}>;

export function CategoryCard({
  parent,
  subcategories,
  categories = subcategories,
  onEdit,
  onArchive
}: CategoryCardProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="relative overflow-visible rounded-[22px] border border-border bg-surface-elevated p-5.5 shadow-sm animate-fade-in focus-within:z-30">
      <div className="flex items-start gap-4">
        <div
          style={swatchStyle(parent.color)}
          className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[17px] text-2xl font-semibold ${
            parent.color === undefined
              ? "bg-accent text-accent-foreground shadow-glow"
              : "text-white"
          }`}
          aria-hidden="true"
        >
          <IconGlyph value={glyphFor(parent)} size={26} />
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
        <div className="relative">
          <button
            type="button"
            aria-label={`Actions for ${parent.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-lg text-foreground-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ⋯
          </button>
          {menuOpen ? (
            <CategoryActionMenu
              category={parent}
              onEdit={onEdit}
              onArchive={onArchive}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </div>
      {subcategories.length === 0 ? null : (
        <div className="mt-4.5 space-y-2 border-t border-border pt-4.5">
          {subcategories.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              categories={categories}
              depth={0}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type CategoryTreeItemProps = Readonly<{
  category: Category;
  categories: readonly Category[];
  depth: number;
  onEdit: ((category: Category) => void) | undefined;
  onArchive: (category: Category) => void;
}>;

function CategoryTreeItem({
  category,
  categories,
  depth,
  onEdit,
  onArchive
}: CategoryTreeItemProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const children = categories.filter((item) => item.parentId === category.id);
  return (
    <div style={{ marginLeft: Math.min(depth, 4) * 12 }}>
      <div className="relative flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-muted py-1.5 pr-1.5 pl-2 text-[13px] font-semibold text-foreground">
        <span
          style={swatchStyle(category.color)}
          className={`grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg text-xs ${
            category.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
          }`}
          aria-hidden="true"
        >
          <IconGlyph value={glyphFor(category)} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
        {category.color === undefined ? null : (
          <span
            aria-label={`Colour ${category.color}`}
            title={category.color}
            style={{ backgroundColor: category.color }}
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface-elevated"
          />
        )}
        <button
          type="button"
          aria-label={`Actions for ${category.name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ⋯
        </button>
        {menuOpen ? (
          <CategoryActionMenu
            category={category}
            onEdit={onEdit}
            onArchive={onArchive}
            onClose={() => setMenuOpen(false)}
          />
        ) : null}
      </div>
      {children.length === 0 ? null : (
        <div className="mt-2 space-y-2 border-l border-border pl-2">
          {children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              categories={categories}
              depth={depth + 1}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type CategoryActionMenuProps = Readonly<{
  category: Category;
  onEdit: ((category: Category) => void) | undefined;
  onArchive: (category: Category) => void;
  onClose: () => void;
}>;

function CategoryActionMenu({
  category,
  onEdit,
  onArchive,
  onClose
}: CategoryActionMenuProps): ReactNode {
  function edit(): void {
    onClose();
    onEdit?.(category);
  }

  function archive(): void {
    onClose();
    onArchive(category);
  }

  return (
    <div
      aria-label={`Actions for ${category.name}`}
      className="absolute top-11 right-0 z-50 w-44 overflow-hidden rounded-xl border border-border bg-surface-elevated p-1.5 shadow-xl"
    >
      {onEdit === undefined ? null : (
        <>
          <button
            type="button"
            onClick={edit}
            className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={edit}
            className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Re-parent
          </button>
        </>
      )}
      <button
        type="button"
        onClick={archive}
        className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-expense hover:bg-expense/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
      >
        Archive
      </button>
    </div>
  );
}

"use client";

import {
  formatMinor,
  formatSignedCompactMinor,
  type BudgetProgress,
  type Category,
  type CategoryGroup
} from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { glyphFor, lighten, tint } from "../model/palette";
import { IconGlyph } from "./icon-glyph";

function swatchStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return {
    background: `linear-gradient(135deg, ${lighten(color, 0.16)}, ${color})`,
    boxShadow: `0 6px 16px ${tint(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.25)`
  };
}

export type CategoryStats = Readonly<{
  spentMinor: number;
  incomeMinor: number;
  txnCount: number;
}>;

type CategoryCardProps = Readonly<{
  parent: Category;
  subcategories: readonly Category[];
  categories?: readonly Category[] | undefined;
  stats?: CategoryStats | undefined;
  budget?: BudgetProgress | undefined;
  categoryStatsMap?: ReadonlyMap<string, CategoryStats> | undefined;
  onEdit?: ((category: Category) => void) | undefined;
  onArchive: (category: Category) => void;
  onAddSubcategory?: ((parentCategory: Category) => void) | undefined;
  onUpdateGroup?: ((category: Category, group: CategoryGroup | null) => void) | undefined;
}>;

export function CategoryCard({
  parent,
  subcategories,
  categories = subcategories,
  stats,
  budget,
  categoryStatsMap,
  onEdit,
  onArchive,
  onAddSubcategory,
  onUpdateGroup
}: CategoryCardProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

  const spentMinor = stats?.spentMinor ?? 0;
  const incomeMinor = stats?.incomeMinor ?? 0;
  const txnCount = stats?.txnCount ?? 0;
  const hasActivity = txnCount > 0;
  const isExpense = parent.kind === "expense";

  // Calculate budget metrics if budget is present
  const budgetUtilization =
    budget !== undefined ? Math.min(Math.round(budget.utilizationBps / 100), 100) : 0;
  const budgetOver = budget !== undefined && budget.remainingMinor < 0;

  return (
    <div className="relative overflow-visible rounded-2xl border border-border/80 bg-surface-elevated p-5 shadow-xs transition-all duration-200 hover:border-accent/40 hover:shadow-md focus-within:z-20">
      {/* Top Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            style={swatchStyle(parent.color)}
            className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl text-xl font-semibold shadow-xs transition-transform duration-200 hover:scale-105 ${
              parent.color === undefined
                ? "bg-accent text-accent-foreground shadow-glow"
                : "text-white"
            }`}
            aria-hidden="true"
          >
            <IconGlyph value={glyphFor(parent)} size={22} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold tracking-tight text-foreground">
                {parent.name}
              </h3>

              {isExpense ? (
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`50/30/20 Group: ${parent.group ?? "Unassigned"}`}
                    aria-expanded={groupDropdownOpen}
                    onClick={() => setGroupDropdownOpen((open) => !open)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      parent.group === "essential"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                        : parent.group === "lifestyle"
                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
                          : "bg-surface-muted text-foreground-muted hover:bg-surface-muted/80 hover:text-foreground"
                    }`}
                  >
                    <span>
                      {parent.group === "essential"
                        ? "Essential · Needs"
                        : parent.group === "lifestyle"
                          ? "Lifestyle · Wants"
                          : "+ Set Group"}
                    </span>
                    <span className="text-[9px] opacity-70">▾</span>
                  </button>

                  {groupDropdownOpen ? (
                    <div className="absolute top-7 left-0 z-50 w-48 overflow-hidden rounded-xl border border-border bg-surface-elevated p-1 shadow-xl animate-fade-in">
                      <p className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-foreground-muted">
                        50/30/20 Grouping
                      </p>
                      {[
                        { group: "essential" as const, label: "Essential (Needs)" },
                        { group: "lifestyle" as const, label: "Lifestyle (Wants)" },
                        { group: null, label: "Unassigned" }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setGroupDropdownOpen(false);
                            onUpdateGroup?.(parent, item.group);
                          }}
                          className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                            parent.group === item.group ||
                            (parent.group === undefined && item.group === null)
                              ? "bg-accent/15 font-bold text-accent"
                              : "text-foreground hover:bg-surface-muted"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Income
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs text-foreground-muted">
              {subcategories.length > 0
                ? `${subcategories.length} subcategor${subcategories.length === 1 ? "y" : "ies"}`
                : "Top-level category"}
            </p>
          </div>
        </div>

        {/* Card Action Menu */}
        <div className="relative flex items-center gap-1.5">
          {onAddSubcategory !== undefined ? (
            <button
              type="button"
              aria-label={`Add subcategory to ${parent.name}`}
              onClick={() => onAddSubcategory(parent)}
              className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border/80 bg-surface-muted/60 px-2.5 py-1.5 text-xs font-medium text-foreground-muted hover:border-accent/40 hover:bg-surface-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="text-sm font-bold leading-none">+</span> Subcategory
            </button>
          ) : null}

          <button
            type="button"
            aria-label={`Actions for ${parent.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border/70 bg-surface-muted/60 text-base text-foreground-muted hover:bg-surface-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ⋯
          </button>
          {menuOpen ? (
            <CategoryActionMenu
              category={parent}
              onEdit={onEdit}
              onArchive={onArchive}
              onAddSubcategory={onAddSubcategory}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </div>

      {/* Monthly Spend & Activity Row */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/60 bg-surface-muted/40 px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            This month:
          </span>
          <span className="font-semibold text-foreground">
            {hasActivity
              ? isExpense
                ? `${formatMinor(spentMinor)} spent`
                : `${formatMinor(incomeMinor)} earned`
              : "No activity this month"}
          </span>
          {hasActivity ? (
            <span className="text-foreground-muted font-mono text-[11px]">
              ({txnCount} txn{txnCount === 1 ? "" : "s"})
            </span>
          ) : null}
        </div>

        <Link
          href={`/transactions?categoryId=${parent.id}`}
          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
        >
          <span>View entries</span>
          <span aria-hidden="true" className="text-xs">
            →
          </span>
        </Link>
      </div>

      {/* Mini Budget Meter if budget exists */}
      {budget !== undefined ? (
        <div className="mt-2.5 rounded-xl border border-border/60 bg-surface-muted/30 p-2.5 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-foreground-muted">
              Monthly Budget:{" "}
              <span className="font-semibold text-foreground">
                {formatSignedCompactMinor(budget.spentMinor)}
              </span>{" "}
              / {formatSignedCompactMinor(budget.budget.limitMinor)}
            </span>
            <span
              className={`font-mono font-bold ${
                budgetOver
                  ? "text-rose-600 dark:text-rose-400"
                  : budget.state === "approaching"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {budgetOver ? "Exceeded" : `${budgetUtilization}%`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              style={{ width: `${budgetUtilization}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                budgetOver
                  ? "bg-rose-500"
                  : budget.state === "approaching"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
          </div>
        </div>
      ) : null}

      {/* Subcategories Tree Section */}
      {subcategories.length === 0 ? null : (
        <div className="mt-4 space-y-1.5 border-t border-border/70 pt-3.5">
          <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-foreground-muted">
            Subcategories ({subcategories.length})
          </p>
          {subcategories.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              categories={categories}
              stats={categoryStatsMap?.get(child.id)}
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
  stats?: CategoryStats | undefined;
  depth: number;
  onEdit: ((category: Category) => void) | undefined;
  onArchive: (category: Category) => void;
}>;

function CategoryTreeItem({
  category,
  categories,
  stats,
  depth,
  onEdit,
  onArchive
}: CategoryTreeItemProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const children = categories.filter((item) => item.parentId === category.id);
  const spentMinor = stats?.spentMinor ?? 0;
  const txnCount = stats?.txnCount ?? 0;

  return (
    <div style={{ marginLeft: Math.min(depth, 4) * 12 }}>
      <div className="group relative flex min-h-10 items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface-muted/70 py-1.5 pr-1.5 pl-2 text-xs font-semibold text-foreground hover:border-accent/30 hover:bg-surface-muted transition-colors">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            style={swatchStyle(category.color)}
            className={`grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md text-[10px] ${
              category.color === undefined ? "bg-accent text-accent-foreground" : "text-white"
            }`}
            aria-hidden="true"
          >
            <IconGlyph value={glyphFor(category)} size={12} />
          </span>
          <span className="truncate">{category.name}</span>
          {category.color !== undefined ? (
            <span
              aria-label={`Colour ${category.color}`}
              title={category.color}
              style={{ backgroundColor: category.color }}
              className="h-2 w-2 shrink-0 rounded-full ring-1 ring-surface-elevated"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {txnCount > 0 ? (
            <Link
              href={`/transactions?categoryId=${category.id}`}
              className="font-mono text-[11px] font-medium text-foreground-muted hover:text-accent hover:underline transition-colors"
            >
              {formatMinor(spentMinor)} ({txnCount})
            </Link>
          ) : null}

          <div className="relative">
            <button
              type="button"
              aria-label={`Actions for ${category.name}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="grid h-7 w-7 place-items-center rounded-md text-sm text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        </div>
      </div>

      {children.length === 0 ? null : (
        <div className="mt-1.5 space-y-1.5 border-l-2 border-border/80 pl-2.5 ml-3">
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
  onAddSubcategory?: ((parentCategory: Category) => void) | undefined;
  onClose: () => void;
}>;

function CategoryActionMenu({
  category,
  onEdit,
  onArchive,
  onAddSubcategory,
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

  function addSub(): void {
    onClose();
    onAddSubcategory?.(category);
  }

  return (
    <div
      aria-label={`Actions for ${category.name}`}
      className="absolute top-8 right-0 z-50 w-44 overflow-hidden rounded-xl border border-border bg-surface-elevated p-1 shadow-xl animate-fade-in"
    >
      {onAddSubcategory !== undefined && category.parentId === undefined ? (
        <button
          type="button"
          onClick={addSub}
          className="min-h-9 w-full rounded-lg px-3 text-left text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          + Add subcategory
        </button>
      ) : null}

      <Link
        href={`/transactions?categoryId=${category.id}`}
        onClick={onClose}
        className="flex min-h-9 w-full items-center rounded-lg px-3 text-left text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        View transactions
      </Link>

      {onEdit !== undefined ? (
        <>
          <button
            type="button"
            onClick={edit}
            className="min-h-9 w-full rounded-lg px-3 text-left text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Edit category
          </button>
          <button
            type="button"
            onClick={edit}
            className="min-h-9 w-full rounded-lg px-3 text-left text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Re-parent
          </button>
        </>
      ) : null}

      <div className="my-1 border-t border-border/60" />

      <button
        type="button"
        onClick={archive}
        className="min-h-9 w-full rounded-lg px-3 text-left text-xs font-semibold text-expense hover:bg-expense/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
      >
        Archive category
      </button>
    </div>
  );
}

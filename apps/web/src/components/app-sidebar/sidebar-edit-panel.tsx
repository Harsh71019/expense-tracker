"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { NavItem } from "../app-nav/nav-items";

type Item = NavItem & { visible: boolean };

export function SidebarEditPanel({
  items,
  compact,
  onReorder,
  onToggle,
  onReset
}: Readonly<{
  items: readonly Item[];
  compact: boolean;
  onReorder: (from: number, to: number) => void;
  onToggle: (href: string) => void;
  onReset: () => void;
}>): ReactNode {
  const dragIndex = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  function handleDragStart(index: number): void {
    dragIndex.current = index;
  }

  function handleDragEnter(index: number): void {
    setDropTarget(index);
  }

  function handleDragLeave(): void {
    setDropTarget(null);
  }

  function handleDrop(targetIndex: number): void {
    const from = dragIndex.current;
    if (from !== null && from !== targetIndex) {
      onReorder(from, targetIndex);
    }
    dragIndex.current = null;
    setDropTarget(null);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
  }

  return (
    <div className="flex flex-col gap-1" role="list" aria-label="Reorder navigation items">
      {items.map((item, index) => (
        <div
          key={item.href}
          role="listitem"
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(index)}
          className={[
            "group flex items-center gap-2 rounded-lg border border-dashed px-2 py-2",
            "cursor-grab active:cursor-grabbing transition-colors duration-100",
            item.visible ? "opacity-100" : "opacity-40",
            dropTarget === index
              ? "border-accent bg-accent-glow/30"
              : "border-border hover:border-accent/50 hover:bg-surface-muted/50"
          ].join(" ")}
          title={compact ? item.label : undefined}
        >
          {/* Drag handle glyph */}
          <span
            className="text-foreground-muted opacity-50 group-hover:opacity-100 text-xs select-none"
            aria-hidden="true"
          >
            ⠿
          </span>

          {/* Icon */}
          {item.icon !== undefined && (
            <span
              className="w-5 text-center text-base leading-none text-foreground-muted"
              aria-hidden="true"
            >
              {item.icon}
            </span>
          )}

          {/* Label (hidden in compact mode) */}
          {!compact && (
            <span className="flex-1 min-w-0 truncate text-sm text-foreground">{item.label}</span>
          )}

          {/* Keyboard move buttons */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label={`Move ${item.label} up`}
              disabled={index === 0}
              onClick={() => onReorder(index, index - 1)}
              className="grid h-5 w-5 place-items-center rounded text-[10px] text-foreground-muted hover:text-foreground disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${item.label} down`}
              disabled={index === items.length - 1}
              onClick={() => onReorder(index, index + 1)}
              className="grid h-5 w-5 place-items-center rounded text-[10px] text-foreground-muted hover:text-foreground disabled:opacity-30"
            >
              ↓
            </button>
          </div>

          {/* Visibility toggle */}
          <button
            type="button"
            aria-label={item.visible ? `Hide ${item.label}` : `Show ${item.label}`}
            aria-pressed={item.visible}
            onClick={() => onToggle(item.href)}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded text-sm transition-colors ${
              item.visible
                ? "text-accent hover:text-accent/70"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {item.visible ? "◉" : "○"}
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onReset}
        className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-accent/40 hover:text-foreground"
      >
        Restore defaults
      </button>
    </div>
  );
}

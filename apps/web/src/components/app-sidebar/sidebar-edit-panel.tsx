"use client";

import { useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
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
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const rowPositions = useRef(new Map<string, DOMRect>());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const visibleItemCount = items.filter((item) => item.visible).length;

  useLayoutEffect(() => {
    const positions = new Map<string, DOMRect>();
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const [href, row] of rowRefs.current) {
      const previousPosition = rowPositions.current.get(href);
      const nextPosition = row.getBoundingClientRect();
      positions.set(href, nextPosition);

      if (reduceMotion || previousPosition === undefined) {
        continue;
      }

      const translateY = previousPosition.top - nextPosition.top;
      if (translateY !== 0 && typeof row.animate === "function") {
        row.animate(
          [
            {
              transform: `translateY(${translateY}px)`,
              boxShadow: "0 12px 22px rgba(8, 122, 75, 0.12)"
            },
            { transform: "translateY(0)", boxShadow: "0 0 0 rgba(8, 122, 75, 0)" }
          ],
          { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
      }
    }

    rowPositions.current = positions;
  }, [items]);

  function setRowRef(href: string, row: HTMLDivElement | null): void {
    if (row === null) {
      rowRefs.current.delete(href);
      return;
    }
    rowRefs.current.set(href, row);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, index: number): void {
    dragIndex.current = index;
    setDraggedIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", items[index]?.href ?? "");
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, index: number): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget !== index) {
      setDropTarget(index);
    }
  }

  function clearDragState(): void {
    dragIndex.current = null;
    setDraggedIndex(null);
    setDropTarget(null);
  }

  function handleDrop(targetIndex: number): void {
    const from = dragIndex.current;
    if (from !== null && from !== targetIndex) {
      onReorder(from, targetIndex);
      const item = items[from];
      if (item !== undefined) {
        setAnnouncement(`${item.label} moved.`);
      }
    }
    clearDragState();
  }

  function handleMove(index: number, targetIndex: number): void {
    const item = items[index];
    if (item === undefined) {
      return;
    }

    onReorder(index, targetIndex);
    setAnnouncement(`${item.label} moved ${targetIndex < index ? "up" : "down"}.`);
  }

  function handleToggle(item: Item): void {
    onToggle(item.href);
    setAnnouncement(`${item.label} ${item.visible ? "hidden" : "shown"}.`);
  }

  return (
    <section
      className="animate-sidebar-editor-in space-y-3 motion-reduce:animate-none"
      aria-label="Edit sidebar"
    >
      <header className="relative overflow-hidden rounded-2xl border border-accent/20 bg-accent-glow/35 p-3.5 shadow-xs">
        <span
          className="pointer-events-none absolute -top-6 -right-5 h-20 w-20 rounded-full border border-accent/15 bg-accent-glow blur-sm"
          aria-hidden="true"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent text-sm text-accent-foreground shadow-glow">
              <span aria-hidden="true">⠿</span>
            </span>
            <div className="min-w-0">
              <p className="font-mono text-2xs font-bold tracking-[0.16em] text-accent uppercase">
                Sidebar layout
              </p>
              <h2 className="mt-0.5 text-sm font-bold tracking-tight text-foreground">
                Arrange your workspace
              </h2>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-accent/20 bg-surface-elevated/80 px-2 py-1 font-mono text-2xs font-bold text-accent">
            {visibleItemCount}/{items.length}
          </span>
        </div>
        <p className="relative mt-3 text-xs leading-5 text-foreground-muted">
          Drag destinations into place. Use the eye control to keep only the sections you use.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="flex items-center gap-1.5 font-mono text-2xs font-semibold tracking-wide text-foreground-muted uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" aria-hidden="true" />
          Saved on this device
        </p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-2 py-1 text-2xs font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Restore defaults
        </button>
      </div>

      <div className="flex flex-col gap-1.5" role="list" aria-label="Reorder navigation items">
        {items.map((item, index) => (
          <div
            key={item.href}
            ref={(row) => setRowRef(item.href, row)}
            role="listitem"
            aria-label={item.label}
            draggable
            onDragStart={(event) => handleDragStart(event, index)}
            onDragOver={(event) => handleDragOver(event, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={clearDragState}
            style={{ animationDelay: `${index * 24}ms` }}
            className={[
              "group animate-sidebar-row-in relative flex items-center gap-2 overflow-hidden rounded-xl border px-2 py-2 motion-reduce:animate-none",
              "cursor-grab transition-[transform,opacity,box-shadow,border-color,background-color] duration-200 ease-out active:cursor-grabbing motion-reduce:transition-none",
              item.visible ? "bg-surface-elevated opacity-100" : "bg-surface-muted/45 opacity-55",
              draggedIndex === index
                ? "scale-[0.98] opacity-45 shadow-inner"
                : "hover:-translate-y-px hover:shadow-xs",
              dropTarget === index
                ? "border-accent bg-accent-glow/40 shadow-glow"
                : "border-border/80 hover:border-accent/45"
            ].join(" ")}
            title={compact ? item.label : undefined}
          >
            <span
              className={`w-5 shrink-0 text-center font-mono text-2xs font-bold transition-colors ${
                dropTarget === index ? "text-accent" : "text-foreground-muted/70"
              }`}
              aria-hidden="true"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="text-foreground-muted opacity-45 transition-opacity group-hover:opacity-100 text-xs select-none"
              aria-hidden="true"
            >
              ⠿
            </span>

            {item.icon !== undefined && (
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-muted text-center text-sm leading-none text-foreground-muted transition-colors group-hover:bg-accent-glow group-hover:text-accent"
                aria-hidden="true"
              >
                {item.icon}
              </span>
            )}

            {!compact && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {item.label}
                </span>
                <span className="block font-mono text-2xs text-foreground-muted">
                  {item.visible ? "Shown" : "Hidden"}
                </span>
              </span>
            )}

            <div className="flex shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted/65">
              <button
                type="button"
                aria-label={`Move ${item.label} up`}
                disabled={index === 0}
                onClick={() => handleMove(index, index - 1)}
                className="grid h-7 w-7 place-items-center text-xs text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${item.label} down`}
                disabled={index === items.length - 1}
                onClick={() => handleMove(index, index + 1)}
                className="grid h-7 w-7 place-items-center border-l border-border text-xs text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                ↓
              </button>
            </div>

            <button
              type="button"
              aria-label={item.visible ? `Hide ${item.label}` : `Show ${item.label}`}
              aria-pressed={item.visible}
              disabled={item.visible && visibleItemCount === 1}
              onClick={() => handleToggle(item)}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm transition-[transform,color,background-color,border-color] duration-150 active:scale-90 motion-reduce:transition-none ${
                item.visible
                  ? "border-accent/25 bg-accent-glow/55 text-accent hover:bg-accent hover:text-accent-foreground"
                  : "border-border bg-surface-muted/65 text-foreground-muted hover:border-accent/35 hover:text-accent"
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {item.visible ? "◉" : "○"}
            </button>
          </div>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

# Sidebar Customization — Drag-and-Drop Reorder + Add/Remove Links

> **Status**: Implemented
> **Scope**: `apps/web` only (purely a client-side UX preference; no API or backend changes)  
> **Guiding constraint**: Zero new runtime dependencies — we use the browser's native Drag and Drop API plus the existing `localStorage` pattern already present in the sidebar.

---

## 1. Overview

Users will be able to personalise their sidebar through an **Edit Mode** panel built directly into the sidebar. When Edit Mode is active:

1. Every nav link gains a **drag handle** — users can reorder items by dragging them into a new position.
2. A **visibility toggle** (eye icon) appears next to each item — users can hide items they never use.
3. A **"Restore defaults"** button resets everything back to the canonical `mainNavItems` order.
4. Changes are persisted in `localStorage` so they survive page reloads.

Edit Mode is toggled by a small **pencil icon button** that lives in the sidebar footer, next to the existing `ThemeToggle`.

---

## 2. Current Architecture

```
apps/web/src/components/
├── app-sidebar/
│   └── app-sidebar.tsx          ← renders the aside, logo, AppNav, ThemeToggle, account link
├── app-nav/
│   ├── app-nav.tsx              ← renders <nav> with Link items (sidebar + bottom orientations)
│   ├── nav-items.ts             ← exports all top-level desktop destinations as `mainNavItems`
│   └── index.ts                 ← re-exports both
└── mobile-bottom-nav/
    └── mobile-bottom-nav.tsx    ← fixed 5-slot mobile nav (independent, not affected)
```

`AppSidebar` reads `compact` from `localStorage` on mount.  
`AppNav` accepts `items: readonly NavItem[]` and renders them in order.  
`mainNavItems` is a static `as const` tuple — the canonical source of truth for desktop links. Detail routes remain under their parent destination; the mobile-only `/more` route is not duplicated in the sidebar.

---

## 3. Architecture for the New Feature

We introduce a thin **preference layer** that sits between `mainNavItems` (static truth) and `AppNav` (renderer).

```
localStorage
  "treasury-ops-nav-prefs"
       │
       ▼
useNavPreferences() hook     ← new, in app-nav/use-nav-preferences.ts
       │  returns: orderedVisibleItems, allItems, reorder(), toggleVisible(), reset()
       ▼
AppSidebar
  ├── (edit mode OFF) ──→ <AppNav items={orderedVisibleItems} />
  └── (edit mode ON)  ──→ <SidebarEditPanel
                              items={allItems}
                              onReorder={reorder}
                              onToggle={toggleVisible}
                              onReset={reset}
                           />
```

No backend changes, no new npm packages, no changes to the API client.

---

## 4. Data Model

### 4.1 Preference shape (stored in `localStorage`)

```typescript
// packages/shared is not involved — this is purely a UI preference.
// Defined locally in apps/web/src/components/app-nav/use-nav-preferences.ts

type NavPref = {
  href: string;      // identifies the item (same as NavItem.href — the unique key)
  visible: boolean;  // whether it appears in the rendered nav
};

type StoredNavPrefs = {
  version: 1;                 // for future migration
  items: readonly NavPref[];  // full ordered list including hidden items
};
```

### 4.2 localStorage key

```
"treasury-ops-nav-prefs"
```

Follows the existing naming convention (`treasury-ops-sidebar-compact`).

### 4.3 Derivation rules

| Case | Behaviour |
|---|---|
| No prefs stored | Use `mainNavItems` order, all visible |
| New item added to `mainNavItems` that isn't in stored prefs | Append it as `visible: true` at the end |
| Item removed from `mainNavItems` but still in stored prefs | Silently drop it (keep the rest) |
| Duplicate href in stored prefs | Keep the first occurrence and repair the stored value |
| `version` mismatch | Reset to defaults and re-save |
| User tries to hide the final visible item | Keep it visible so the sidebar always has a destination |

---

## 5. Files to Create / Modify

### 5.1 [NEW] `apps/web/src/components/app-nav/use-nav-preferences.ts`

The core hook — pure state + persistence, no JSX.

**Responsibilities:**
- Load prefs from `localStorage` in a `useEffect` (avoids SSR mismatch — no `window` access during server render)
- Merge canonical `mainNavItems` with stored prefs (handles new routes being added over time)
- Prune hrefs that no longer exist in `mainNavItems` (handles removed routes)
- Expose `orderedVisibleItems` (to pass to `AppNav`) and `allOrderedItems` (to pass to `SidebarEditPanel`)
- Expose `reorder(fromIndex, toIndex)`, `toggleVisible(href)`, and `reset()` mutations
- Write back to `localStorage` on every mutation

**Key logic:**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { mainNavItems, type NavItem } from "./nav-items";

const STORAGE_KEY = "treasury-ops-nav-prefs";
const CURRENT_VERSION = 1;

type NavPref = { href: string; visible: boolean };
type StoredNavPrefs = { version: 1; items: readonly NavPref[] };

function defaultPrefs(): StoredNavPrefs {
  return {
    version: CURRENT_VERSION,
    items: mainNavItems.map((item) => ({ href: item.href, visible: true })),
  };
}

function loadPrefs(): StoredNavPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return defaultPrefs();
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as StoredNavPrefs).version !== CURRENT_VERSION
    ) {
      return defaultPrefs();
    }
    const stored = parsed as StoredNavPrefs;

    // Merge: add any new canonical items the stored prefs don't know about
    const knownHrefs = new Set(stored.items.map((p) => p.href));
    const merged: NavPref[] = [...stored.items];
    for (const item of mainNavItems) {
      if (!knownHrefs.has(item.href)) {
        merged.push({ href: item.href, visible: true });
      }
    }

    // Remove stale hrefs no longer in mainNavItems
    const canonical = new Set(mainNavItems.map((i) => i.href));
    const pruned = merged.filter((p) => canonical.has(p.href));

    // Safety: if all are hidden, reset
    const hasVisible = pruned.some((p) => p.visible);
    if (!hasVisible) return defaultPrefs();

    return { version: CURRENT_VERSION, items: pruned };
  } catch {
    return defaultPrefs();
  }
}

export type UseNavPreferences = {
  orderedVisibleItems: readonly NavItem[];
  allOrderedItems: readonly (NavItem & { visible: boolean })[];
  reorder: (fromIndex: number, toIndex: number) => void;
  toggleVisible: (href: string) => void;
  reset: () => void;
};

export function useNavPreferences(): UseNavPreferences {
  const [prefs, setPrefs] = useState<StoredNavPrefs>(defaultPrefs);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const persist = useCallback((next: StoredNavPrefs): void => {
    setPrefs(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const reorder = useCallback(
    (fromIndex: number, toIndex: number): void => {
      const items = [...prefs.items];
      const [moved] = items.splice(fromIndex, 1);
      if (moved === undefined) return;
      items.splice(toIndex, 0, moved);
      persist({ ...prefs, items });
    },
    [prefs, persist]
  );

  const toggleVisible = useCallback(
    (href: string): void => {
      const items = prefs.items.map((p) =>
        p.href === href ? { ...p, visible: !p.visible } : p
      );
      persist({ ...prefs, items });
    },
    [prefs, persist]
  );

  const reset = useCallback((): void => {
    persist(defaultPrefs());
  }, [persist]);

  const itemMap = new Map(mainNavItems.map((i) => [i.href, i]));

  const allOrderedItems = prefs.items.flatMap((p) => {
    const item = itemMap.get(p.href);
    return item !== undefined ? [{ ...item, visible: p.visible }] : [];
  });

  const orderedVisibleItems = allOrderedItems
    .filter((i) => i.visible)
    .map(({ visible: _visible, ...item }) => item);

  return { orderedVisibleItems, allOrderedItems, reorder, toggleVisible, reset };
}
```

---

### 5.2 [NEW] `apps/web/src/components/app-sidebar/sidebar-edit-panel.tsx`

The drag-and-drop editor rendered inside the sidebar when edit mode is active.

**Key implementation decisions:**
- Use the **native HTML5 Drag and Drop API** (`draggable`, `onDragStart`, `onDragOver`, `onDrop`). No library needed.
- Track drag state with `useRef` (avoids extra re-renders during drag — the component only re-renders on actual reorder).
- Drop indicator: a CSS class toggled on the hovered row via `onDragEnter` / `onDragLeave` + React state for the target index.
- Keyboard accessibility: each row has ↑ / ↓ icon buttons so keyboard-only users aren't blocked (native DnD is not keyboard-accessible).
- Compact mode: labels are hidden (matching the sidebar's compact nav), items show icon + controls only.

**Component sketch:**

```tsx
"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { NavItem } from "../app-nav/nav-items";

type Item = NavItem & { visible: boolean };

export function SidebarEditPanel({
  items,
  compact,
  onReorder,
  onToggle,
  onReset,
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
    e.preventDefault(); // required for drop to fire
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
              : "border-border hover:border-accent/50 hover:bg-surface-muted/50",
          ].join(" ")}
        >
          {/* Drag handle glyph */}
          <span className="text-foreground-muted opacity-50 group-hover:opacity-100 text-xs select-none" aria-hidden="true">
            ⠿
          </span>

          {/* Icon */}
          {item.icon !== undefined && (
            <span className="w-5 text-center text-base leading-none text-foreground-muted" aria-hidden="true">
              {item.icon}
            </span>
          )}

          {/* Label (hidden in compact mode) */}
          {!compact && (
            <span className="flex-1 min-w-0 truncate text-sm text-foreground">
              {item.label}
            </span>
          )}

          {/* Keyboard move buttons */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label={`Move ${item.label} up`}
              disabled={index === 0}
              onClick={() => onReorder(index, index - 1)}
              className="grid h-5 w-5 place-items-center rounded text-[10px] text-foreground-muted hover:text-foreground disabled:opacity-30"
            >↑</button>
            <button
              type="button"
              aria-label={`Move ${item.label} down`}
              disabled={index === items.length - 1}
              onClick={() => onReorder(index, index + 1)}
              className="grid h-5 w-5 place-items-center rounded text-[10px] text-foreground-muted hover:text-foreground disabled:opacity-30"
            >↓</button>
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
```

---

### 5.3 [MODIFY] `apps/web/src/components/app-nav/index.ts`

Add one export line:

```typescript
export * from "./app-nav";
export * from "./nav-items";
export * from "./use-nav-preferences";  // ← new
```

---

### 5.4 [MODIFY] `apps/web/src/components/app-sidebar/app-sidebar.tsx`

Three additions to the existing ~97-line file:

1. **Import** `useNavPreferences` and `SidebarEditPanel`.
2. **State**: `const [editMode, setEditMode] = useState(false)` (not persisted — resets on navigation like a drawer).
3. **Hook call**: `const { orderedVisibleItems, allOrderedItems, reorder, toggleVisible, reset } = useNavPreferences()`.
4. **Conditional render**: swap `<AppNav items={mainNavItems} ...>` with the edit panel / nav depending on `editMode`.
5. **Edit button** in the footer alongside `ThemeToggle`.

```tsx
// Footer section (replaces the current ThemeToggle-only section):
<div className="flex flex-col gap-2">
  <div className={`flex gap-2 ${compact ? "flex-col" : ""}`}>
    <ThemeToggle current={theme} compact={compact} />
    <button
      type="button"
      id="sidebar-edit-toggle"
      onClick={() => setEditMode((m) => !m)}
      aria-label={editMode ? "Done editing sidebar" : "Edit sidebar"}
      aria-pressed={editMode}
      title={compact ? (editMode ? "Done" : "Edit sidebar") : undefined}
      className={`flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors duration-150 ${
        editMode
          ? "border-accent bg-accent-glow text-accent"
          : "border-border text-foreground-muted hover:border-accent/40 hover:text-foreground"
      } ${compact ? "h-10 w-10" : "flex-1"}`}
    >
      <span aria-hidden="true">{editMode ? "✓" : "✎"}</span>
      {!compact && <span>{editMode ? "Done" : "Edit"}</span>}
    </button>
  </div>

  <Link href="/settings" ...>
    {/* account link unchanged */}
  </Link>
</div>
```

```tsx
// Nav section:
<div className="flex flex-col gap-7">
  {/* logo header unchanged */}
  {editMode ? (
    <SidebarEditPanel
      items={allOrderedItems}
      compact={compact}
      onReorder={reorder}
      onToggle={toggleVisible}
      onReset={reset}
    />
  ) : (
    <AppNav items={orderedVisibleItems} orientation="sidebar" compact={compact} />
  )}
</div>
```

---

## 6. Interaction Design

### 6.1 Layout (expanded sidebar)

```
┌─────────────────────────┐
│  ₹  TreasuryOps         │
│  ───────────────────    │
│  Normal mode:           │
│    ⌂  Dashboard         │
│    ▣  Accounts          │
│    …  (other items)     │
│                         │
│  Edit mode:             │
│  ⠿  ⌂  Dashboard  ↑↓ ◉ │
│  ⠿  ▣  Accounts   ↑↓ ◉ │
│  ⠿  ✦  Insights   ↑↓ ○ │  ← hidden (○)
│  …                      │
│  [Restore defaults]     │
│  ─────────────────────  │
│  [☀ Theme] [✎ Edit]     │  ← footer
│  [HA  harsh@example.com]│
└─────────────────────────┘
```

### 6.2 Drag visual feedback

| State | Visual |
|---|---|
| Dragging item | Ghost image (browser native); original row at `opacity-50` via `:active` |
| Hovered drop target | `border-accent bg-accent-glow/30` on that row |
| Drop complete | Immediate list re-render (React state flush) |

### 6.3 Compact mode

Opening Edit mode from a compact sidebar expands it first and saves the expanded preference. This gives each row enough room for its label, drag handle, move controls, and visibility control. The editable list scrolls independently, so the reset action remains reachable on short screens.

---

## 7. Persistence

| Action | Effect on `localStorage["treasury-ops-nav-prefs"]` |
|---|---|
| Drag-and-drop reorder | Updates `items[].href` order |
| Toggle visibility | Flips `items[i].visible` |
| Restore defaults | Writes canonical defaults |
| First visit (no key) | Nothing written until first mutation |
| All items hidden | Auto-resets to defaults (safety guard) |

No server state is touched. The preference is invisible to the API, ledger, and audit log.

---

## 8. TypeScript Compliance

Per `AGENTS.md` strict rules:

| Rule | Compliance |
|---|---|
| No `any` | `JSON.parse` result typed as `unknown`, narrowed before use |
| No unsafe `as` | Only `as StoredNavPrefs` after shape + version check |
| No `!` non-null | `moved === undefined` guard before array splice |
| No `enum` | `version: 1` literal, not an enum member |
| Explicit return types | All exported functions have explicit return types |
| `"use client"` directive | On hook and panel (both need browser APIs / state) |
| No Drizzle / HTTP calls | None — localStorage only |

---

## 9. Testing Plan

### 9.1 Hook unit tests

**File:** `apps/web/src/components/app-nav/__tests__/use-nav-preferences.test.ts`

```
✓ Default prefs: orderedVisibleItems equals mainNavItems
✓ Reorder: moving index 0 → 2 produces correct order
✓ Toggle hide: item absent from orderedVisibleItems after toggleVisible(href)
✓ Toggle show: item returns after second toggleVisible call
✓ Reset: orderedVisibleItems equals mainNavItems after reset()
✓ Persistence: localStorage written; second render reads same order
✓ New canonical item merged: new href in mainNavItems appears as visible
✓ Stale href pruned: href removed from mainNavItems is stripped on load
✓ All-hidden safety: falls back to defaults if all prefs are visible=false
✓ Version mismatch: falls back to defaults if version !== 1
✓ Corrupt JSON: falls back to defaults if JSON.parse throws
```

### 9.2 SidebarEditPanel unit tests

**File:** `apps/web/src/components/app-sidebar/__tests__/sidebar-edit-panel.test.tsx`

```
✓ Renders all item labels
✓ Visibility toggle calls onToggle with correct href
✓ Move-up button calls onReorder(index, index-1)
✓ Move-down button calls onReorder(index, index+1)
✓ First item: move-up button has disabled attribute
✓ Last item: move-down button has disabled attribute
✓ Restore defaults calls onReset
✓ aria-pressed="true" on visible items' toggle button
✓ aria-pressed="false" on hidden items' toggle button
✓ Hidden items rendered with opacity-40 class
```

### 9.3 Updated AppSidebar tests

Add to `apps/web/src/components/app-sidebar/__tests__/app-sidebar.test.tsx`:

```
✓ "Edit sidebar" button is visible in the footer
✓ Clicking "Edit sidebar" shows the edit panel (drag-handle glyphs visible)
✓ Clicking "Done editing sidebar" restores the normal nav links
✓ An item hidden via localStorage pref is absent from the nav
✓ All canonical items still reachable via the edit panel in edit mode
```

---

## 10. Implementation Order

```
Step 1  Write useNavPreferences hook + all its tests (pure logic)
Step 2  Write SidebarEditPanel component + its tests
Step 3  Modify AppSidebar to wire everything together
Step 4  Extend AppSidebar tests with edit-mode cases
Step 5  pnpm lint && pnpm typecheck && pnpm test — must all pass zero errors
```

---

## 11. Deliberate Out-of-Scope Decisions

| Topic | Decision |
|---|---|
| **Mobile bottom nav** | Not customisable in v1. Fixed 5-slot layout needs separate UX design. |
| **Server persistence** | Rejected. Cosmetic UI preference — not financial data. |
| **`dnd-kit` / `react-beautiful-dnd`** | Rejected. Native HTML5 DnD is sufficient; keeps the no-casual-deps rule. |
| **Touch / mobile drag** | Native DnD has no touch support. Keyboard ↑↓ buttons serve as the accessible touch-friendly equivalent. Future v2 can add pointer-events drag. |
| **Cross-tab sync** | Not needed for a personal single-device app. |
| **`packages/shared` changes** | None — this is a UI preference, not a shared schema or zod type. |

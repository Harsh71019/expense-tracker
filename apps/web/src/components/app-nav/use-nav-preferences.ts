"use client";

import { useCallback, useEffect, useState } from "react";
import { mainNavItems, type NavItem } from "./nav-items";

const STORAGE_KEY = "treasury-ops-nav-prefs";
const CURRENT_VERSION = 1;

type NavPref = { href: string; visible: boolean };
type StoredNavPrefs = { version: 1; items: readonly NavPref[] };

function isNavPref(item: unknown): item is NavPref {
  if (typeof item !== "object" || item === null) return false;
  return (
    "href" in item &&
    typeof item.href === "string" &&
    "visible" in item &&
    typeof item.visible === "boolean"
  );
}

function isStoredNavPrefs(value: unknown): value is StoredNavPrefs {
  if (typeof value !== "object" || value === null) return false;
  if (!("version" in value) || value.version !== CURRENT_VERSION) return false;
  if (!("items" in value) || !Array.isArray(value.items)) return false;
  return value.items.every(isNavPref);
}

function defaultPrefs(): StoredNavPrefs {
  return {
    version: CURRENT_VERSION,
    items: mainNavItems.map((item) => ({ href: item.href, visible: true }))
  };
}

function loadPrefs(): StoredNavPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return defaultPrefs();
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredNavPrefs(parsed)) {
      return defaultPrefs();
    }

    // Merge: add any new canonical items the stored prefs don't know about
    const knownHrefs = new Set(parsed.items.map((p) => p.href));
    const merged: NavPref[] = [...parsed.items];
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
      const items = prefs.items.map((p) => (p.href === href ? { ...p, visible: !p.visible } : p));
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

  const orderedVisibleItems: readonly NavItem[] = allOrderedItems
    .filter((i) => i.visible)
    .map(({ href, label, icon }) => (icon !== undefined ? { href, label, icon } : { href, label }));

  return { orderedVisibleItems, allOrderedItems, reorder, toggleVisible, reset };
}

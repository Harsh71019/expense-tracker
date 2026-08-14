"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mainNavItems, type NavItem } from "./nav-items";

const STORAGE_KEY = "treasury-ops-nav-prefs";
const CURRENT_VERSION = 1;

type NavPref = { href: string; visible: boolean };
type StoredNavPrefs = { version: 1; items: readonly NavPref[] };
type LoadedPrefs = Readonly<{ prefs: StoredNavPrefs; shouldPersist: boolean }>;

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

function loadPrefs(): LoadedPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { prefs: defaultPrefs(), shouldPersist: false };
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredNavPrefs(parsed)) {
      return { prefs: defaultPrefs(), shouldPersist: true };
    }

    const canonical = new Set(mainNavItems.map((item) => item.href));
    const knownHrefs = new Set<string>();
    const merged: NavPref[] = [];

    for (const item of parsed.items) {
      if (canonical.has(item.href) && !knownHrefs.has(item.href)) {
        merged.push(item);
        knownHrefs.add(item.href);
      }
    }

    for (const item of mainNavItems) {
      if (!knownHrefs.has(item.href)) {
        merged.push({ href: item.href, visible: true });
      }
    }

    if (!merged.some((item) => item.visible)) {
      return { prefs: defaultPrefs(), shouldPersist: true };
    }

    const prefs: StoredNavPrefs = { version: CURRENT_VERSION, items: merged };
    return { prefs, shouldPersist: JSON.stringify(prefs) !== raw };
  } catch {
    return { prefs: defaultPrefs(), shouldPersist: true };
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
  const prefsRef = useRef(prefs);

  useEffect(() => {
    const loaded = loadPrefs();
    prefsRef.current = loaded.prefs;
    setPrefs(loaded.prefs);
    if (loaded.shouldPersist) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded.prefs));
    }
  }, []);

  const persist = useCallback((next: StoredNavPrefs): void => {
    prefsRef.current = next;
    setPrefs(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const reorder = useCallback(
    (fromIndex: number, toIndex: number): void => {
      const current = prefsRef.current;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.items.length ||
        toIndex >= current.items.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const items = [...current.items];
      const [moved] = items.splice(fromIndex, 1);
      if (moved === undefined) return;
      items.splice(toIndex, 0, moved);
      persist({ ...current, items });
    },
    [persist]
  );

  const toggleVisible = useCallback(
    (href: string): void => {
      const current = prefsRef.current;
      const target = current.items.find((item) => item.href === href);
      const visibleCount = current.items.filter((item) => item.visible).length;
      if (target === undefined || (target.visible && visibleCount === 1)) {
        return;
      }

      const items = current.items.map((item) =>
        item.href === href ? { ...item, visible: !item.visible } : item
      );
      persist({ ...current, items });
    },
    [persist]
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

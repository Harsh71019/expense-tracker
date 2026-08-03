import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mainNavItems } from "../nav-items";
import { useNavPreferences } from "../use-nav-preferences";

const STORAGE_KEY = "treasury-ops-nav-prefs";

describe("useNavPreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns default prefs matching mainNavItems when localStorage is empty", () => {
    const { result } = renderHook(() => useNavPreferences());
    expect(result.current.orderedVisibleItems).toEqual(mainNavItems);
    expect(result.current.allOrderedItems.length).toBe(mainNavItems.length);
    expect(result.current.allOrderedItems.every((item) => item.visible)).toBe(true);
  });

  it("reorders items correctly when reorder is called", () => {
    const { result } = renderHook(() => useNavPreferences());
    const firstHref = mainNavItems[0]?.href ?? "";
    const thirdHref = mainNavItems[2]?.href ?? "";

    act(() => {
      result.current.reorder(0, 2);
    });

    expect(result.current.orderedVisibleItems[2]?.href).toBe(firstHref);
    expect(result.current.orderedVisibleItems[0]?.href).toBe(mainNavItems[1]?.href);
    expect(result.current.orderedVisibleItems[1]?.href).toBe(thirdHref);
  });

  it("toggles item visibility off and on", () => {
    const { result } = renderHook(() => useNavPreferences());
    const targetHref = mainNavItems[0]?.href ?? "";

    act(() => {
      result.current.toggleVisible(targetHref);
    });

    expect(result.current.orderedVisibleItems.some((i) => i.href === targetHref)).toBe(false);
    expect(result.current.allOrderedItems.find((i) => i.href === targetHref)?.visible).toBe(false);

    act(() => {
      result.current.toggleVisible(targetHref);
    });

    expect(result.current.orderedVisibleItems.some((i) => i.href === targetHref)).toBe(true);
    expect(result.current.allOrderedItems.find((i) => i.href === targetHref)?.visible).toBe(true);
  });

  it("resets to defaults when reset is called", () => {
    const { result } = renderHook(() => useNavPreferences());
    const targetHref = mainNavItems[0]?.href ?? "";

    act(() => {
      result.current.reorder(0, 3);
      result.current.toggleVisible(targetHref);
    });

    expect(result.current.orderedVisibleItems).not.toEqual(mainNavItems);

    act(() => {
      result.current.reset();
    });

    expect(result.current.orderedVisibleItems).toEqual(mainNavItems);
  });

  it("persists to localStorage and reads back on fresh hook mount", () => {
    const { result: r1 } = renderHook(() => useNavPreferences());

    act(() => {
      r1.current.reorder(0, 2);
    });

    const expectedOrder = r1.current.orderedVisibleItems.map((i) => i.href);

    const { result: r2 } = renderHook(() => useNavPreferences());
    const loadedOrder = r2.current.orderedVisibleItems.map((i) => i.href);

    expect(loadedOrder).toEqual(expectedOrder);
  });

  it("merges new canonical items that are missing from stored prefs", () => {
    // Save stored prefs missing the last mainNavItem
    const truncatedItems = mainNavItems.slice(0, -1).map((i) => ({ href: i.href, visible: true }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items: truncatedItems }));

    const { result } = renderHook(() => useNavPreferences());
    expect(result.current.allOrderedItems.length).toBe(mainNavItems.length);
    const lastItem = mainNavItems[mainNavItems.length - 1];
    expect(result.current.orderedVisibleItems.some((i) => i.href === lastItem?.href)).toBe(true);
  });

  it("prunes stale hrefs that no longer exist in mainNavItems", () => {
    const storedWithStale = {
      version: 1,
      items: [
        { href: "/old-removed-route", visible: true },
        ...mainNavItems.map((i) => ({ href: i.href, visible: true }))
      ]
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedWithStale));

    const { result } = renderHook(() => useNavPreferences());
    expect(result.current.allOrderedItems.some((i) => i.href === "/old-removed-route")).toBe(false);
    expect(result.current.allOrderedItems.length).toBe(mainNavItems.length);
  });

  it("falls back to defaults if all stored items are hidden", () => {
    const allHidden = {
      version: 1,
      items: mainNavItems.map((i) => ({ href: i.href, visible: false }))
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allHidden));

    const { result } = renderHook(() => useNavPreferences());
    expect(result.current.orderedVisibleItems).toEqual(mainNavItems);
  });

  it("falls back to defaults if version mismatch", () => {
    const wrongVersion = {
      version: 99,
      items: mainNavItems.map((i) => ({ href: i.href, visible: true }))
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wrongVersion));

    const { result } = renderHook(() => useNavPreferences());
    expect(result.current.orderedVisibleItems).toEqual(mainNavItems);
  });

  it("falls back to defaults if localStorage has corrupt JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{corrupt json!!!");

    const { result } = renderHook(() => useNavPreferences());
    expect(result.current.orderedVisibleItems).toEqual(mainNavItems);
  });
});

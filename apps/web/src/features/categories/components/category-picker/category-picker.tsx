"use client";

import {
  normalizeCategorySearchText,
  type Category,
  type CategoryKind
} from "@treasury-ops/shared";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { IconGlyph } from "../icon-glyph";
import { glyphFor, tint } from "../../model/palette";
import { useCategoryRecommendations } from "../../hooks/use-category-recommendations";

import {
  CategoryPickerList,
  UNCATEGORIZED_OPTION_ID,
  categoryOptionId,
  type PickerListOption
} from "./category-picker-list";
import { matchesSearch, textContains } from "./category-picker-search";
import {
  CategoryRecommendationChips,
  recommendationOptionId
} from "./category-recommendation-chips";

export type CategoryPickerProps = Readonly<{
  categories: readonly Category[];
  type: CategoryKind;
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
  description?: string;
  occurredAt: Date;
  disabled?: boolean;
  allowUncategorized?: boolean;
  label?: string;
  categoriesError?: boolean;
  onRetryCategories?: () => void;
}>;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function CategoryPicker({
  categories,
  type,
  value,
  onChange,
  description,
  occurredAt,
  disabled = false,
  allowUncategorized = true,
  label = "Category",
  categoriesError = false,
  onRetryCategories
}: CategoryPickerProps): ReactNode {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const searchId = `${generatedId}-search`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeOptionId, setActiveOptionId] = useState(UNCATEGORIZED_OPTION_ID);

  const eligible = useMemo(
    () => categories.filter((category) => category.kind === type && !category.isArchived),
    [categories, type]
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const selected =
    value === undefined
      ? undefined
      : (categoriesById.get(value) ?? eligible.find((item) => item.id === value));
  const staleSelection = value !== undefined && selected !== undefined && selected.isArchived;
  const descriptionDraft = description ?? "";
  const debouncedDescription = useDebouncedValue(
    descriptionDraft,
    descriptionDraft.trim() === "" ? 0 : 300
  );

  const recommendationsQuery = useCategoryRecommendations({
    enabled: open,
    type,
    occurredAt,
    ...(debouncedDescription.trim() === "" ? {} : { description: debouncedDescription })
  });

  const searchQuery = normalizeCategorySearchText(search);
  const visibleRecommendations = useMemo(() => {
    const items = recommendationsQuery.data?.items ?? [];
    return items.filter((item) => {
      const category = categoriesById.get(item.categoryId);
      if (category === undefined || category.isArchived || category.kind !== type) return false;
      const parent =
        category.parentId === undefined ? undefined : categoriesById.get(category.parentId);
      return matchesSearch(category, parent?.name, searchQuery);
    });
  }, [recommendationsQuery.data?.items, categoriesById, type, searchQuery]);

  const listOptions = useMemo((): PickerListOption[] => {
    const options: PickerListOption[] = [];
    if (allowUncategorized) {
      const uncategorizedMatches =
        searchQuery === "" ||
        textContains(normalizeCategorySearchText("uncategorized"), searchQuery);
      if (uncategorizedMatches) {
        options.push({
          id: UNCATEGORIZED_OPTION_ID,
          categoryId: undefined,
          label: "Uncategorized",
          indent: false
        });
      }
    }
    const children = new Map<string, Category[]>();
    const roots: Category[] = [];
    for (const category of eligible) {
      if (
        category.parentId === undefined ||
        !eligible.some((item) => item.id === category.parentId)
      ) {
        roots.push(category);
        continue;
      }
      const siblings = children.get(category.parentId) ?? [];
      siblings.push(category);
      children.set(category.parentId, siblings);
    }
    roots.sort((left, right) => left.name.localeCompare(right.name));
    for (const root of roots) {
      const parentMatches = matchesSearch(root, undefined, searchQuery);
      const kids = (children.get(root.id) ?? [])
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .filter((child) => parentMatches || matchesSearch(child, root.name, searchQuery));
      if (parentMatches || kids.length > 0) {
        options.push({
          id: categoryOptionId(root.id),
          categoryId: root.id,
          label: root.name,
          indent: false,
          category: root
        });
        for (const child of kids) {
          options.push({
            id: categoryOptionId(child.id),
            categoryId: child.id,
            label: child.name,
            indent: true,
            category: child
          });
        }
      }
    }
    if (
      staleSelection &&
      selected !== undefined &&
      !options.some((option) => option.categoryId === selected.id)
    ) {
      options.unshift({
        id: categoryOptionId(selected.id),
        categoryId: selected.id,
        label: `${selected.name} (unavailable)`,
        indent: false,
        category: selected
      });
    }
    return options;
  }, [allowUncategorized, eligible, searchQuery, selected, staleSelection]);

  const keyboardOptions = useMemo(() => {
    const recIds = visibleRecommendations.map((item) => recommendationOptionId(item.categoryId));
    return [...recIds, ...listOptions.map((option) => option.id)];
  }, [visibleRecommendations, listOptions]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent): void {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current !== null &&
        !containerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    const input = document.getElementById(searchId);
    if (input instanceof HTMLInputElement) {
      input.focus();
    }
  }, [open, searchId, type]);

  useEffect(() => {
    if (keyboardOptions.includes(activeOptionId)) return;
    setActiveOptionId(keyboardOptions[0] ?? UNCATEGORIZED_OPTION_ID);
  }, [activeOptionId, keyboardOptions]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function closeAndFocusTrigger(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectCategory(categoryId: string | undefined): void {
    onChange(categoryId);
    closeAndFocusTrigger();
  }

  function moveActive(delta: number): void {
    const current = keyboardOptions.indexOf(activeOptionId);
    const nextIndex = Math.min(
      Math.max((current === -1 ? 0 : current) + delta, 0),
      keyboardOptions.length - 1
    );
    const next = keyboardOptions[nextIndex];
    if (next !== undefined) setActiveOptionId(next);
  }

  function activateCurrent(): void {
    if (activeOptionId === UNCATEGORIZED_OPTION_ID) {
      selectCategory(undefined);
      return;
    }
    if (activeOptionId.startsWith("rec:")) {
      selectCategory(activeOptionId.slice(4));
      return;
    }
    if (activeOptionId.startsWith("cat:")) {
      selectCategory(activeOptionId.slice(4));
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return;
    if (open && event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        if (keyboardOptions[0] !== undefined) setActiveOptionId(keyboardOptions[0]);
        break;
      case "End": {
        event.preventDefault();
        const last = keyboardOptions[keyboardOptions.length - 1];
        if (last !== undefined) setActiveOptionId(last);
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        activateCurrent();
        break;
      case "Escape":
        event.preventDefault();
        closeAndFocusTrigger();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const triggerDisabled = disabled || (categories.length === 0 && !categoriesError);
  const color = selected?.color ?? "#64748b";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={triggerDisabled}
        onClick={() => {
          if (triggerDisabled) return;
          setOpen((current) => !current);
        }}
        onKeyDown={handleTriggerKeyDown}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      >
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs"
          style={{ backgroundColor: tint(color, 0.18), color }}
        >
          <IconGlyph value={selected === undefined ? "∅" : glyphFor(selected)} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {selected === undefined ? "Uncategorized" : selected.name}
        </span>
        <ChevronDown size={16} className="shrink-0 text-foreground-muted" />
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={activeOptionId}
          onKeyDown={handlePanelKeyDown}
          className="absolute z-30 mt-1 w-full min-w-[16rem] max-w-[min(100vw-2rem,28rem)] rounded-xl border border-border bg-surface-elevated p-3 shadow-lg"
        >
          <label htmlFor={searchId} className="sr-only">
            Search categories
          </label>
          <input
            id={searchId}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeAndFocusTrigger();
              }
            }}
            placeholder="Search categories…"
            autoComplete="off"
            className="mb-3 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          {categoriesError ? (
            <div className="mb-3 flex items-center justify-between gap-2 text-sm text-expense">
              <span>Could not load categories.</span>
              {onRetryCategories === undefined ? null : (
                <button type="button" className="underline" onClick={onRetryCategories}>
                  Retry
                </button>
              )}
            </div>
          ) : null}
          <div aria-live="polite" className="sr-only">
            {recommendationsQuery.isFetching ? "Loading recommendations" : ""}
          </div>
          {recommendationsQuery.isFetching && recommendationsQuery.data === undefined ? (
            <div className="mb-3 space-y-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : null}
          {recommendationsQuery.isError || visibleRecommendations.length === 0 ? null : (
            <div className="mb-3">
              <CategoryRecommendationChips
                recommendations={visibleRecommendations}
                categoriesById={categoriesById}
                selectedId={value}
                activeOptionId={activeOptionId}
                onSelect={selectCategory}
                onFocusOption={setActiveOptionId}
              />
            </div>
          )}
          {listOptions.length === 0 && searchQuery !== "" ? (
            <div className="space-y-2 py-2 text-sm text-foreground-muted">
              <p>No matching categories</p>
              <button type="button" className="text-accent underline" onClick={() => setSearch("")}>
                Clear search
              </button>
            </div>
          ) : eligible.length === 0 ? (
            <div className="space-y-2 py-2 text-sm text-foreground-muted">
              <p>No categories yet.</p>
              <Link href="/categories" className="text-accent underline">
                Manage categories
              </Link>
            </div>
          ) : (
            <CategoryPickerList
              type={type}
              options={listOptions}
              selectedId={value}
              activeOptionId={activeOptionId}
              onSelect={selectCategory}
              onFocusOption={setActiveOptionId}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

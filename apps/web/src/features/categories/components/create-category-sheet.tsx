"use client";

import {
  CreateCategorySchema,
  UpdateCategorySchema,
  type Category,
  type CategoryKind
} from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConflictError, ValidationError } from "@/lib/errors";

import { useCreateCategory, useUpdateCategory } from "../hooks/use-category-mutations";
import { IconGlyph } from "./icon-glyph";
import { ICON_CHOICES } from "../model/icon-registry";
import { COLOR_CHOICES } from "../model/palette";

type CategoryFormField = "name" | "kind" | "parentId" | "icon" | "color";

function fieldErrorName(path: string): CategoryFormField | null {
  if (
    path === "name" ||
    path === "kind" ||
    path === "parentId" ||
    path === "icon" ||
    path === "color"
  ) {
    return path;
  }
  return null;
}

type CreateCategorySheetProps = Readonly<{
  defaultKind: CategoryKind;
  categories: readonly Category[];
  category?: Category;
  quickRename?: boolean;
  onClose: () => void;
  onSaved?: (category: Category) => void | Promise<void>;
}>;

export function CreateCategorySheet({
  defaultKind,
  categories,
  category,
  quickRename = false,
  onClose,
  onSaved
}: CreateCategorySheetProps): ReactNode {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const editing = category !== undefined;
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind);
  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [color, setColor] = useState(category?.color ?? "");
  const [errors, setErrors] = useState<Partial<Record<CategoryFormField, string>>>({});

  const excludedParentIds =
    category === undefined ? new Set<string>() : descendantIds(categories, category.id);

  const parentOptions = categories.filter(
    (option) =>
      (!option.isArchived || (category?.isArchived === true && option.id === category.parentId)) &&
      option.kind === kind &&
      option.id !== category?.id &&
      !excludedParentIds.has(option.id)
  );

  function changeKind(next: CategoryKind): void {
    setKind(next);
    setParentId("");
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});
    try {
      let saved: Category;
      if (category === undefined) {
        const parsed = CreateCategorySchema.safeParse({
          name,
          kind,
          ...(parentId === "" ? {} : { parentId }),
          ...(icon === "" ? {} : { icon }),
          ...(color === "" ? {} : { color })
        });
        if (!parsed.success) {
          const next: Partial<Record<CategoryFormField, string>> = {};
          for (const issue of parsed.error.issues) {
            const field = fieldErrorName(issue.path.join("."));
            if (field !== null) next[field] = issue.message;
          }
          setErrors(next);
          return;
        }
        saved = await create.mutateAsync(parsed.data);
      } else {
        const parsed = UpdateCategorySchema.safeParse({
          name,
          parentId: parentId === "" ? null : parentId,
          icon: icon === "" ? null : icon,
          color: color === "" ? null : color
        });
        if (!parsed.success) {
          const next: Partial<Record<CategoryFormField, string>> = {};
          for (const issue of parsed.error.issues) {
            const field = fieldErrorName(issue.path.join("."));
            if (field !== null) next[field] = issue.message;
          }
          setErrors(next);
          return;
        }
        saved = await update.mutateAsync({ categoryId: category.id, patch: parsed.data });
      }
      toast.success(editing ? "Category updated" : "Category created");
      await onSaved?.(saved);
      onClose();
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        const next: Partial<Record<CategoryFormField, string>> = {};
        for (const field of error.fields) {
          const name = fieldErrorName(field.path);
          if (name !== null) next[name] = field.message;
        }
        setErrors(next);
      } else if (error instanceof ConflictError) {
        const field = error.context.problemType === "category.name_conflict" ? "name" : "parentId";
        setErrors({ [field]: error.message });
      } else {
        toast.error(`Could not ${editing ? "update" : "create"} this category`);
      }
    }
  }

  const previewGlyph = icon || name.trim().charAt(0).toUpperCase() || "?";
  const canSubmit = name.trim().length > 0;

  return (
    <DialogSurface variant="drawer" labelledBy="category-form-title" onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <h2 id="category-form-title" className="text-xl font-bold tracking-tight text-foreground">
          {quickRename ? "Rename to restore" : editing ? "Edit category" : "New category"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close category form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-sm text-foreground-muted">
        {quickRename
          ? "Choose a name that is not used by an active sibling. Saving will restore the category."
          : "Set the name, icon, colour, and place in your category tree."}
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
        <div>
          <span className="mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Kind
          </span>
          {editing ? (
            <div className="flex min-h-11 items-center rounded-lg border border-border bg-surface-muted px-3.5 text-sm font-semibold text-foreground">
              {kind === "expense" ? "Expense" : "Income"}
            </div>
          ) : (
            <div className="flex gap-2">
              {(["expense", "income"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => changeKind(value)}
                  className={`min-h-11 flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    kind === value
                      ? "border-accent bg-accent-glow text-accent"
                      : "border-border text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {value === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Input
            id="category-name"
            label="Name"
            value={name}
            name="categoryName"
            autoComplete="off"
            maxLength={80}
            placeholder="Groceries…"
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name === undefined ? null : (
            <span className="mt-1.5 inline-block rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense">
              {errors.name}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          <span>
            Parent category{" "}
            <span className="font-sans text-[11px] font-normal normal-case tracking-normal text-foreground-muted">
              optional · {kind} only
            </span>
          </span>
          <Select
            aria-label="Parent category"
            name="parentId"
            options={[
              { value: "", label: "None (top-level)" },
              ...parentOptions.map((option) => ({ value: option.id, label: option.name }))
            ]}
            placeholder="None (top-level)"
            value={parentId}
            onChange={setParentId}
          />
          {errors.parentId === undefined ? null : (
            <span className="font-sans text-[11px] font-medium normal-case tracking-normal text-expense">
              {errors.parentId}
            </span>
          )}
        </div>

        {editing && (category.parentId ?? "") !== parentId ? (
          <p className="rounded-xl border border-accent/25 bg-accent-glow px-3.5 py-3 text-xs leading-relaxed text-foreground-muted">
            Moving this category changes where its full sub-tree appears. Existing transactions keep
            their category.
          </p>
        ) : null}

        <div>
          <span className="mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Icon{" "}
            <span className="font-sans text-[11px] font-normal normal-case tracking-normal">
              optional
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-label="No icon"
              aria-pressed={icon === ""}
              onClick={() => setIcon("")}
              className={`grid h-11 w-11 place-items-center rounded-lg border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                icon === ""
                  ? "border-accent bg-accent-glow text-accent"
                  : "border-border bg-surface-muted text-foreground-muted"
              }`}
            >
              ∅
            </button>
            {ICON_CHOICES.map((key) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={`grid h-11 w-11 place-items-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  icon === key
                    ? "border-accent bg-accent-glow text-accent"
                    : "border-border bg-surface-muted text-foreground-muted"
                }`}
              >
                <IconGlyph value={key} size={20} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Colour{" "}
            <span className="font-sans text-[11px] font-normal normal-case tracking-normal">
              optional
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="No colour"
              aria-pressed={color === ""}
              onClick={() => setColor("")}
              className={`h-11 w-11 rounded-lg bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                color === "" ? "ring-2 ring-foreground" : "border border-border"
              }`}
            />
            {COLOR_CHOICES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                aria-pressed={color === hex}
                onClick={() => setColor(hex)}
                style={{ backgroundColor: hex }}
                className={`h-11 w-11 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${color === hex ? "ring-2 ring-foreground" : ""}`}
              />
            ))}
          </div>
          <div className="mt-3 flex items-end gap-2.5">
            <Input
              id="category-color"
              label="Custom hex"
              value={color}
              name="categoryColor"
              autoComplete="off"
              maxLength={7}
              placeholder="#2563EB"
              onChange={(event) => setColor(event.target.value)}
            />
            <span
              aria-hidden="true"
              style={/^#[a-f\d]{6}$/i.test(color) ? { backgroundColor: color } : undefined}
              className="mb-0.5 h-10 w-10 shrink-0 rounded-lg border border-border bg-surface-muted"
            />
          </div>
          {errors.color === undefined ? null : (
            <span className="mt-1.5 inline-block text-xs font-medium text-expense">
              {errors.color}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-muted p-4">
          <p className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
            Preview
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            <span
              style={color === "" ? undefined : { backgroundColor: `${color}29` }}
              className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg text-base font-semibold text-foreground ${
                color === "" ? "bg-surface-elevated" : ""
              }`}
            >
              <IconGlyph value={previewGlyph} size={20} />
            </span>
            <span className="text-sm font-semibold text-foreground">
              {name.trim() || "Category name"}
            </span>
          </div>
        </div>

        <div className="safe-area-bottom sticky bottom-0 flex gap-2.5 border-t border-border bg-surface-elevated/95 pt-4 backdrop-blur sm:justify-end">
          <Button
            className="flex-1 sm:flex-none"
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            type="submit"
            disabled={!canSubmit || create.isPending || update.isPending}
          >
            {create.isPending || update.isPending
              ? editing
                ? "Saving…"
                : "Creating…"
              : quickRename
                ? "Save and unarchive"
                : editing
                  ? "Save changes"
                  : "Create category"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}

function descendantIds(categories: readonly Category[], categoryId: string): Set<string> {
  const descendants = new Set<string>();
  const pending = [categoryId];
  while (pending.length > 0) {
    const parentId = pending.shift();
    if (parentId === undefined) break;
    for (const category of categories) {
      if (category.parentId === parentId && !descendants.has(category.id)) {
        descendants.add(category.id);
        pending.push(category.id);
      }
    }
  }
  return descendants;
}

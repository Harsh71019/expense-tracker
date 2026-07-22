"use client";

import {
  CreateCategorySchema,
  type Category,
  type CategoryKind,
  type CreateCategory
} from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidationError } from "@/lib/errors";

import { useCreateCategory } from "../hooks/use-category-mutations";
import { IconGlyph } from "./icon-glyph";
import { ICON_CHOICES } from "../model/icon-registry";
import { COLOR_CHOICES } from "../model/palette";

const selectClasses =
  "w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function fieldErrorName(path: string): keyof CreateCategory | null {
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
  onClose: () => void;
}>;

export function CreateCategorySheet({
  defaultKind,
  categories,
  onClose
}: CreateCategorySheetProps): ReactNode {
  const create = useCreateCategory();
  const [kind, setKind] = useState<CategoryKind>(defaultKind);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof CreateCategory, string>>>({});

  const parentOptions = categories.filter(
    (category) => category.kind === kind && category.parentId === undefined
  );

  function changeKind(next: CategoryKind): void {
    setKind(next);
    setParentId("");
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateCategorySchema.safeParse({
      name,
      kind,
      ...(parentId === "" ? {} : { parentId }),
      ...(icon === "" ? {} : { icon }),
      ...(color === "" ? {} : { color })
    });
    if (!parsed.success) {
      const next: Partial<Record<keyof CreateCategory, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = fieldErrorName(issue.path.join("."));
        if (field !== null) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      toast.success("Category created");
      onClose();
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        const next: Partial<Record<keyof CreateCategory, string>> = {};
        for (const field of error.fields) {
          const name = fieldErrorName(field.path);
          if (name !== null) next[name] = field.message;
        }
        setErrors(next);
      } else {
        toast.error("Could not create this category");
      }
    }
  }

  const previewGlyph = icon || name.trim().charAt(0).toUpperCase() || "?";
  const canSubmit = name.trim().length > 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-category-title"
        className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7 animate-drawer-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="create-category-title"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            New category
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          Name, kind, icon, colour, and parent are set once and can&apos;t be changed later.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
          <div>
            <span className="mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Kind
            </span>
            <div className="flex gap-2">
              {(["expense", "income"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => changeKind(value)}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    kind === value
                      ? "border-accent bg-accent-glow text-accent"
                      : "border-border text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {value === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Input
              id="category-name"
              label="Name"
              value={name}
              maxLength={80}
              placeholder="e.g. Groceries"
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name === undefined ? null : (
              <span className="mt-1.5 inline-block rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense">
                {errors.name}
              </span>
            )}
          </div>

          <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Parent category{" "}
            <span className="font-sans text-[11px] font-normal normal-case tracking-normal text-foreground-muted">
              optional · {kind} only
            </span>
            <select
              className={selectClasses}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

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
                className={`grid h-10 w-10 place-items-center rounded-lg border text-sm ${
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
                  className={`grid h-10 w-10 place-items-center rounded-lg border ${
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
                className={`h-8 w-8 rounded-lg bg-surface-muted ${
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
                  className={`h-8 w-8 rounded-lg ${color === hex ? "ring-2 ring-foreground" : ""}`}
                />
              ))}
            </div>
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

          <div className="flex justify-end gap-2.5 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending}>
              {create.isPending ? "Creating…" : "Create category"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

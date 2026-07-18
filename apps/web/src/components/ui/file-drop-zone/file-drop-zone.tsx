"use client";

import { useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";

export function FileDropZone({
  accept,
  onFileSelected,
  selectedFileName
}: Readonly<{
  accept: string;
  onFileSelected: (file: File) => void;
  selectedFileName?: string;
}>): ReactNode {
  const [isDragging, setIsDragging] = useState(false);

  function select(files: FileList | null): void {
    const file = files?.[0];
    if (file !== undefined) onFileSelected(file);
  }
  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    select(event.target.files);
  }
  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    select(event.dataTransfer.files);
  }

  return (
    <label
      className={`flex cursor-pointer flex-col items-center rounded-xl border border-dashed p-6 text-center transition-colors ${isDragging ? "border-accent bg-accent/5" : "border-border bg-surface-muted/40"}`}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <span className="text-sm font-semibold text-foreground">
        Drop a CSV here, or choose a file
      </span>
      <span className="mt-1 text-xs text-foreground-muted">
        {selectedFileName ?? "CSV files only"}
      </span>
      <input className="sr-only" type="file" accept={accept} onChange={onChange} />
    </label>
  );
}

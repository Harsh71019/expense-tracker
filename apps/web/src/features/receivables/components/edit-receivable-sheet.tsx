"use client";

import { UpdateReceivableMetadataSchema, type Receivable } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ValidationError } from "@/lib/errors";

import { useUpdateReceivableMetadata } from "../hooks/use-receivable-mutations";
import { calendarDateInIndia } from "../model/receivable-form";

function toDateInputValue(value: Date | undefined): string {
  if (value === undefined) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(value);
}

export function EditReceivableSheet({
  receivable,
  onClose
}: Readonly<{ receivable: Receivable; onClose: () => void }>): ReactNode {
  const update = useUpdateReceivableMetadata();
  const [counterpartyName, setCounterpartyName] = useState(receivable.counterpartyName);
  const [note, setNote] = useState(receivable.note ?? "");
  const [dueAt, setDueAt] = useState(() => toDateInputValue(receivable.dueAt));
  const [error, setError] = useState<string>();

  async function submit(): Promise<void> {
    const parsed = UpdateReceivableMetadataSchema.safeParse({
      counterpartyName,
      note: note.trim() === "" ? null : note.trim(),
      dueAt: dueAt === "" ? null : calendarDateInIndia(dueAt)
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setError(undefined);
    try {
      await update.mutateAsync({ receivableId: receivable.id, body: parsed.data });
      toast.success("Updated");
      onClose();
    } catch (caught: unknown) {
      if (caught instanceof ValidationError) {
        setError(caught.fields[0]?.message ?? caught.message);
      } else {
        toast.error("Could not save these changes");
      }
    }
  }

  return (
    <DialogSurface labelledBy="edit-receivable-title" onClose={onClose} variant="drawer">
      <div className="flex items-start justify-between gap-4">
        <h2 id="edit-receivable-title" className="text-xl font-bold tracking-tight text-foreground">
          Edit details
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <Input
          id="edit-receivable-counterparty"
          label="Who owes this?"
          autoComplete="off"
          maxLength={80}
          value={counterpartyName}
          onChange={(event) => setCounterpartyName(event.target.value)}
        />
        <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          <span>Due date (optional)</span>
          <DatePicker
            id="edit-receivable-due"
            aria-label="Due date"
            clearable
            value={dueAt}
            onChange={setDueAt}
          />
        </div>
        <Input
          id="edit-receivable-note"
          label="Note (optional)"
          autoComplete="off"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-expense">
          {error}
        </p>
      )}

      <div className="safe-area-bottom sticky bottom-0 -mx-5 mt-7 flex flex-col-reverse gap-2.5 border-t border-border bg-surface-elevated px-5 pt-4 pb-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0">
        <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={counterpartyName.trim().length === 0 || update.isPending}
          onClick={() => void submit()}
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </DialogSurface>
  );
}

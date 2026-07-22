"use client";

import { CreateValuationSchema, type Asset } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateValuation } from "../hooks/use-asset-mutations";
import { calendarDateInIndia } from "../model/asset-form";
import { SignedAmountField } from "./signed-amount-field";

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

type AddValuationDialogProps = Readonly<{ asset: Asset; onClose: () => void }>;

export function AddValuationDialog({ asset, onClose }: AddValuationDialogProps): ReactNode {
  const create = useCreateValuation();
  const allowNegative = asset.kind === "loan_liability";
  const [magnitudeMinor, setMagnitudeMinor] = useState(0);
  const [negative, setNegative] = useState(allowNegative);
  const [valuedAt, setValuedAt] = useState(todayInIndia);

  async function submit(): Promise<void> {
    const parsed = CreateValuationSchema.safeParse({
      valueMinor: allowNegative && negative ? -magnitudeMinor : magnitudeMinor,
      valuedAt: calendarDateInIndia(valuedAt),
      source: "manual"
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check this valuation");
      return;
    }
    try {
      await create.mutateAsync({ assetId: asset.id, body: parsed.data });
      toast.success("Valuation added");
      onClose();
    } catch {
      toast.error("Could not add this valuation");
    }
  }

  const canSubmit = magnitudeMinor > 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-valuation-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-valuation-title" className="text-lg font-bold text-foreground">
          Add valuation
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          A new point-in-time value for <strong className="text-foreground">{asset.name}</strong>.
          Valuations are append-only — this doesn&apos;t overwrite the last one.
        </p>

        <div className="mt-5 space-y-5">
          <SignedAmountField
            id="valuation-amount"
            label={`Value${allowNegative ? " (you owe)" : ""}`}
            allowNegative={allowNegative}
            negative={negative}
            onToggleSign={() => setNegative((value) => !value)}
            magnitudeMinor={magnitudeMinor}
            onChange={setMagnitudeMinor}
          />

          <Input
            id="valuation-date"
            label="Valued on"
            type="date"
            value={valuedAt}
            onChange={(event) => setValuedAt(event.target.value)}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || create.isPending}
            onClick={() => void submit()}
          >
            {create.isPending ? "Adding…" : "Add valuation"}
          </Button>
        </div>
      </div>
    </div>
  );
}

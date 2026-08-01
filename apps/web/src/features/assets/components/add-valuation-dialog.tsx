"use client";

import { CreateValuationSchema, type Asset } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
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
    <DialogSurface labelledBy="add-valuation-title" onClose={onClose}>
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

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!canSubmit || create.isPending}
          onClick={() => void submit()}
        >
          {create.isPending ? "Adding…" : "Add valuation"}
        </Button>
      </div>
    </DialogSurface>
  );
}

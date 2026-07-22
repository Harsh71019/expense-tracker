"use client";

import { CreateAssetSchema, type AssetKind } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidationError } from "@/lib/errors";

import { useCreateAsset } from "../hooks/use-asset-mutations";
import { calendarDateInIndia, parseBasisPoints } from "../model/asset-form";
import {
  ASSET_KIND_FULL_LABEL,
  ASSET_KIND_ICON,
  ASSET_KIND_ORDER,
  assetNamePlaceholder
} from "../model/asset-visuals";
import { SignedAmountField } from "./signed-amount-field";

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function CreateAssetDrawer({ onClose }: Readonly<{ onClose: () => void }>): ReactNode {
  const create = useCreateAsset();
  const [kind, setKind] = useState<AssetKind>("fixed_deposit");
  const [name, setName] = useState("");
  const [openedAt, setOpenedAt] = useState(todayInIndia);
  const [maturityAt, setMaturityAt] = useState("");
  const [rate, setRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [magnitudeMinor, setMagnitudeMinor] = useState(0);
  const [negative, setNegative] = useState(false);
  const [error, setError] = useState<string>();

  const allowNegative = kind === "loan_liability";

  function changeKind(next: AssetKind): void {
    setKind(next);
    setMaturityAt("");
    setRate("");
    setQuantity("");
    setNegative(next === "loan_liability");
  }

  async function submit(): Promise<void> {
    const annualRateBps = rate === "" ? undefined : parseBasisPoints(rate);
    if (rate !== "" && annualRateBps === undefined) {
      setError("Enter an annual rate from 0 to 100 with at most two decimal places.");
      return;
    }
    const quantityMilliUnits = quantity === "" ? undefined : Math.round(Number(quantity) * 1000);
    const parsed = CreateAssetSchema.safeParse({
      kind,
      name,
      openedAt: calendarDateInIndia(openedAt),
      openingValueMinor: allowNegative && negative ? -magnitudeMinor : magnitudeMinor,
      ...(kind === "fixed_deposit" && maturityAt !== ""
        ? { maturityAt: calendarDateInIndia(maturityAt) }
        : {}),
      ...(kind === "fixed_deposit" && annualRateBps !== undefined ? { annualRateBps } : {}),
      ...((kind === "gold" || kind === "silver") && quantityMilliUnits !== undefined
        ? { quantityMilliUnits }
        : {})
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the asset details.");
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync(parsed.data);
      toast.success("Asset created");
      onClose();
    } catch (caught: unknown) {
      if (caught instanceof ValidationError) {
        setError(caught.fields[0]?.message ?? caught.message);
      } else {
        toast.error("Could not create this asset");
      }
    }
  }

  const canSubmit = name.trim().length > 0 && magnitudeMinor > 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-asset-title"
        className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7 animate-drawer-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="create-asset-title" className="text-xl font-bold tracking-tight text-foreground">
            New asset
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
          Pick a kind first — the fields adapt to what that kind needs.
        </p>

        <span className="mt-5 mb-2 block text-xs font-semibold text-foreground">Kind</span>
        <div className="grid grid-cols-2 gap-2">
          {ASSET_KIND_ORDER.map((option) => {
            const selected = kind === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => changeKind(option)}
                className={`flex items-center gap-2.5 rounded-[11px] border px-3.5 py-3 text-left transition-colors duration-150 ${
                  selected ? "border-accent bg-accent-glow" : "border-border bg-surface-muted"
                }`}
              >
                <span className="text-lg" aria-hidden="true">
                  {ASSET_KIND_ICON[option]}
                </span>
                <span
                  className={`text-[12.5px] leading-tight font-semibold ${selected ? "text-accent" : "text-foreground"}`}
                >
                  {ASSET_KIND_FULL_LABEL[option]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-5">
          <Input
            id="asset-name"
            label="Name"
            value={name}
            maxLength={80}
            placeholder={assetNamePlaceholder(kind)}
            onChange={(event) => setName(event.target.value)}
          />

          <div className="grid grid-cols-2 gap-3.5">
            <Input
              id="asset-opened"
              label="Opened"
              type="date"
              value={openedAt}
              onChange={(event) => setOpenedAt(event.target.value)}
            />
            {kind === "fixed_deposit" ? (
              <Input
                id="asset-maturity"
                label="Maturity"
                type="date"
                value={maturityAt}
                onChange={(event) => setMaturityAt(event.target.value)}
              />
            ) : null}
          </div>

          {kind === "fixed_deposit" ? (
            <Input
              id="asset-rate"
              label="Annual rate % p.a."
              inputMode="decimal"
              placeholder="7.50"
              value={rate}
              onChange={(event) => setRate(event.target.value.replace(/[^0-9.]/g, ""))}
            />
          ) : null}

          {kind === "gold" || kind === "silver" ? (
            <Input
              id="asset-quantity"
              label="Quantity in grams"
              inputMode="decimal"
              placeholder="24.000"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ""))}
            />
          ) : null}

          <div>
            <SignedAmountField
              id="asset-opening-value"
              label={`Opening value${allowNegative ? " (you owe)" : ""}`}
              allowNegative={allowNegative}
              negative={negative}
              onToggleSign={() => setNegative((value) => !value)}
              magnitudeMinor={magnitudeMinor}
              onChange={setMagnitudeMinor}
            />
            {allowNegative ? (
              <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
                A liability you owe opens negative. Use the −/+ toggle.
              </p>
            ) : null}
          </div>
        </div>

        {error === undefined ? null : (
          <p role="alert" className="mt-3 text-sm text-expense">
            {error}
          </p>
        )}

        <div className="mt-7 flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || create.isPending}
            onClick={() => void submit()}
          >
            {create.isPending ? "Creating…" : "Create asset"}
          </Button>
        </div>
      </div>
    </div>
  );
}

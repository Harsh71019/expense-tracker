"use client";

import { CreateAssetSchema, type AssetKind } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogSurface } from "@/components/ui/dialog";
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
    <DialogSurface labelledBy="create-asset-title" onClose={onClose} variant="drawer">
      <div className="flex items-start justify-between gap-4">
        <h2 id="create-asset-title" className="text-xl font-bold tracking-tight text-foreground">
          New asset
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close asset form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className={`flex min-h-11 items-center gap-2.5 rounded-[11px] border px-3.5 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
          name="name"
          autoComplete="off"
          label="Name"
          value={name}
          maxLength={80}
          placeholder={`${assetNamePlaceholder(kind)}…`}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>Opened</span>
            <DatePicker
              id="asset-opened"
              aria-label="Opened"
              placeholder="Opened"
              value={openedAt}
              onChange={setOpenedAt}
            />
          </div>
          {kind === "fixed_deposit" ? (
            <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              <span>Maturity</span>
              <DatePicker
                id="asset-maturity"
                aria-label="Maturity"
                placeholder="Maturity"
                value={maturityAt}
                onChange={setMaturityAt}
              />
            </div>
          ) : null}
        </div>

        {kind === "fixed_deposit" ? (
          <Input
            id="asset-rate"
            label="Annual rate % p.a."
            inputMode="decimal"
            placeholder="7.50…"
            value={rate}
            onChange={(event) => setRate(event.target.value.replace(/[^0-9.]/g, ""))}
          />
        ) : null}

        {kind === "gold" || kind === "silver" ? (
          <Input
            id="asset-quantity"
            label="Quantity in grams"
            inputMode="decimal"
            placeholder="24.000…"
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

      <div className="safe-area-bottom sticky bottom-0 -mx-5 mt-7 flex flex-col-reverse gap-2.5 border-t border-border bg-surface-elevated px-5 pt-4 pb-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0">
        <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!canSubmit || create.isPending}
          onClick={() => void submit()}
        >
          {create.isPending ? "Creating…" : "Create asset"}
        </Button>
      </div>
    </DialogSurface>
  );
}

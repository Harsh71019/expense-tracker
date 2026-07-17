"use client";

import {
  AssetKindSchema,
  CreateAssetSchema,
  type Asset,
  type AssetKind,
  type NetWorth
} from "@vyaya/shared";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SignedMoney } from "@/components/ui/money";
import { useNetWorth } from "@/features/net-worth/hooks/use-net-worth";

import { useCreateAsset } from "../hooks/use-asset-mutations";
import { useAssets } from "../hooks/use-assets";
import {
  assetKindLabel,
  assetKinds,
  calendarDateInIndia,
  parseBasisPoints
} from "../model/asset-form";

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function AssetManager({
  initialAssets,
  initialNetWorth
}: {
  initialAssets: Asset[];
  initialNetWorth: NetWorth | null;
}): ReactNode {
  const assets = useAssets(initialAssets);
  const netWorth = useNetWorth(initialNetWorth ?? undefined);
  const create = useCreateAsset();
  const [showForm, setShowForm] = useState(initialAssets.length === 0);
  const [kind, setKind] = useState<AssetKind>("investment");
  const [name, setName] = useState("");
  const [openedAt, setOpenedAt] = useState(todayInIndia);
  const [maturityAt, setMaturityAt] = useState("");
  const [rate, setRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [valueMinor, setValueMinor] = useState(0);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const annualRateBps = rate === "" ? undefined : parseBasisPoints(rate);
    if (rate !== "" && annualRateBps === undefined) {
      setError("Enter an annual rate from 0 to 100 with at most two decimal places.");
      return;
    }
    const quantityMilliUnits = quantity === "" ? undefined : Number(quantity);
    const parsed = CreateAssetSchema.safeParse({
      kind,
      name,
      openedAt: calendarDateInIndia(openedAt),
      openingValueMinor: kind === "loan_liability" ? -valueMinor : valueMinor,
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
    try {
      await create.mutateAsync(parsed.data);
      setName("");
      setValueMinor(0);
      setMaturityAt("");
      setRate("");
      setQuantity("");
      setShowForm(false);
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not create this asset.");
    }
  }

  const items = assets.data ?? initialAssets;
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assets and liabilities</h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Values are immutable snapshots; closing preserves all history.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Close form" : "Add asset"}
        </Button>
      </header>

      {showForm ? (
        <form
          className="space-y-5 rounded-xl border border-border bg-surface-elevated p-5 sm:p-7"
          onSubmit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Kind
              <select
                className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm"
                value={kind}
                onChange={(event) => {
                  const parsed = AssetKindSchema.safeParse(event.target.value);
                  if (parsed.success) setKind(parsed.data);
                }}
              >
                {assetKinds.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              id="asset-name"
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              id="asset-opened"
              label="Opened date (Asia/Kolkata)"
              type="date"
              value={openedAt}
              onChange={(event) => setOpenedAt(event.target.value)}
            />
            {kind === "fixed_deposit" ? (
              <>
                <Input
                  id="asset-maturity"
                  label="Maturity date (optional)"
                  type="date"
                  value={maturityAt}
                  onChange={(event) => setMaturityAt(event.target.value)}
                />
                <Input
                  id="asset-rate"
                  label="Annual rate % (optional)"
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </>
            ) : null}
            {kind === "gold" || kind === "silver" ? (
              <Input
                id="asset-quantity"
                label="Quantity in milli-units (optional)"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            ) : null}
          </div>
          <AmountInput
            id="asset-opening-value"
            label={kind === "loan_liability" ? "Amount owed" : "Opening value"}
            value={valueMinor}
            onChange={setValueMinor}
          />
          {kind === "loan_liability" ? (
            <p className="text-sm text-foreground-muted">
              This is stored as a negative liability and reduces net worth.
            </p>
          ) : null}
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create asset with opening valuation"}
          </Button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No active assets"
          description="Add an asset or liability to include it in net worth."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {items.map((asset) => {
            const current = netWorth.data?.assets.find((value) => value.assetId === asset.id);
            return (
              <Link
                key={asset.id}
                href={`/assets/${asset.id}`}
                className="relative flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-surface-muted/50"
              >
                <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />
                <div className="min-w-0 pl-2">
                  <p className="truncate text-sm font-semibold text-foreground">{asset.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-wider text-foreground-muted uppercase">
                    {assetKindLabel(asset.kind)}
                  </p>
                </div>
                {current === undefined ? (
                  <span className="shrink-0 text-sm text-foreground-muted">No valuation</span>
                ) : (
                  <SignedMoney minor={current.valueMinor} size="lg" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

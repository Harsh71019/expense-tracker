"use client";

import { CreateValuationSchema, type Asset, type ValuationPage } from "@vyaya/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { SignedMoney } from "@/components/ui/money";

import { useCloseAsset, useCreateValuation } from "../hooks/use-asset-mutations";
import { useValuations } from "../hooks/use-valuations";
import { assetKindLabel, calendarDateInIndia } from "../model/asset-form";

const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function AssetDetail({
  asset,
  initialValuations
}: {
  asset: Asset;
  initialValuations: ValuationPage;
}): ReactNode {
  const router = useRouter();
  const valuations = useValuations(asset.id, initialValuations);
  const create = useCreateValuation();
  const close = useCloseAsset();
  const [valueMinor, setValueMinor] = useState(0);
  const [valuedAt, setValuedAt] = useState(todayInIndia);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateValuationSchema.safeParse({
      valueMinor: asset.kind === "loan_liability" ? -valueMinor : valueMinor,
      valuedAt: calendarDateInIndia(valuedAt),
      source: "manual"
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check this valuation.");
      return;
    }
    try {
      await create.mutateAsync({ assetId: asset.id, body: parsed.data });
      setValueMinor(0);
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not append this valuation.");
    }
  }

  async function closeAsset(): Promise<void> {
    try {
      await close.mutateAsync(asset.id);
      router.push("/assets");
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not close this asset.");
    }
  }

  const items = valuations.data?.items ?? initialValuations.items;
  return (
    <section className="space-y-6">
      <header>
        <Link href="/assets" className="text-sm text-accent">
          ← Back to assets
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-wider text-foreground-muted uppercase">
          {assetKindLabel(asset.kind)}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{asset.name}</h1>
        <p className="mt-2 text-sm text-foreground-muted">Opened {date.format(asset.openedAt)}</p>
      </header>

      <form
        className="space-y-5 rounded-xl border border-border bg-surface-elevated p-5"
        onSubmit={submit}
      >
        <h2 className="text-lg font-bold">Append valuation</h2>
        <AmountInput
          id="valuation-value"
          label={asset.kind === "loan_liability" ? "Amount owed" : "Current value"}
          value={valueMinor}
          onChange={setValueMinor}
        />
        <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          Valued date (Asia/Kolkata)
          <input
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm"
            type="date"
            value={valuedAt}
            onChange={(event) => setValuedAt(event.target.value)}
          />
        </label>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Appending…" : "Add valuation"}
        </Button>
      </form>

      <section className="rounded-xl border border-border bg-surface-elevated p-5">
        <h2 className="text-lg font-bold">Valuation history</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Newest first. Valuations cannot be edited or deleted.
        </p>
        <div className="mt-4 divide-y divide-border">
          {items.map((valuation) => (
            <div key={valuation.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{date.format(valuation.valuedAt)}</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  {valuation.source === "manual" ? "Manual snapshot" : "Maturity projection"}
                </p>
              </div>
              <SignedMoney minor={valuation.valueMinor} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-expense/25 bg-surface-elevated p-5">
        <h2 className="font-bold">Close asset</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          Closing removes it from current net worth and prevents new valuations. Stored history
          remains intact.
        </p>
        {confirmingClose ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" onClick={() => void closeAsset()} disabled={close.isPending}>
              {close.isPending ? "Closing…" : "Confirm close"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmingClose(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={() => setConfirmingClose(true)}
          >
            Close asset
          </Button>
        )}
      </section>
    </section>
  );
}

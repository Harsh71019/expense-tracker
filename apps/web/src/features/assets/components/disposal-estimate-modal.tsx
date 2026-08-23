"use client";

import {
  formatMicroUnits,
  formatMinor,
  formatPricePerUnit,
  parseMicroUnits,
  parsePricePerUnit,
  type Asset,
  type AssetMarketValuationDetails,
  type DisposalEstimateResult
} from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { useEstimateDisposal } from "../hooks/use-asset-market-valuation";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type DisposalModalProps = Readonly<{
  asset: Asset;
  valuationDetails?: AssetMarketValuationDetails | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

export function DisposalEstimateModal({
  asset,
  valuationDetails,
  open,
  onOpenChange
}: DisposalModalProps): ReactNode {
  const currentTotalMicro = valuationDetails?.position.quantityMicroUnits ?? 0;
  const quoteMicroRupees = valuationDetails?.quote?.priceMicroRupeesPerQuoteUnit;

  const [quantityInput, setQuantityInput] = useState("");
  const [quoteOverrideInput, setQuoteOverrideInput] = useState("");
  const [chargesInput, setChargesInput] = useState("0");
  const [estimate, setEstimate] = useState<DisposalEstimateResult>();

  const estimateMutation = useEstimateDisposal(asset.id);

  // Set default quantity to full holdings on open
  useEffect(() => {
    if (open && currentTotalMicro > 0 && quantityInput === "") {
      setQuantityInput(formatMicroUnits(currentTotalMicro));
    }
  }, [open, currentTotalMicro, quantityInput]);

  if (!open) return null;

  async function calculate(): Promise<void> {
    const qtyMicro = parseMicroUnits(quantityInput);
    if (qtyMicro <= 0) {
      toast.error("Please enter a valid quantity to sell");
      return;
    }

    const quoteOverride =
      quoteOverrideInput.trim() !== "" ? parsePricePerUnit(quoteOverrideInput) : undefined;

    const chargesMinor = Math.round((parseFloat(chargesInput) || 0) * 100);

    try {
      const payload: {
        quantityMicroUnits: number;
        disposalDate: Date;
        quoteOverrideMicroRupeesPerUnit?: number;
        expectedOtherChargesMinor: number;
      } = {
        quantityMicroUnits: qtyMicro,
        disposalDate: new Date(),
        expectedOtherChargesMinor: chargesMinor
      };
      if (quoteOverride !== undefined) {
        payload.quoteOverrideMicroRupeesPerUnit = quoteOverride;
      }

      const result = await estimateMutation.mutateAsync(payload);
      setEstimate(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to calculate disposal estimate";
      toast.error(message);
    }
  }

  function setPercentage(pct: number): void {
    const units = Math.round((currentTotalMicro * pct) / 100);
    setQuantityInput(formatMicroUnits(units));
  }

  return (
    <DialogSurface labelledBy="disposal-modal-title" onClose={() => onOpenChange(false)}>
      <div>
        <h2
          id="disposal-modal-title"
          className="flex items-center gap-2 text-lg font-bold text-foreground"
        >
          <Calculator className="h-5 w-5 text-accent" />
          FIFO Disposal &amp; Tax Estimate
        </h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Estimates post-tax realization using First-In-First-Out (FIFO) lot allocation, post-July
          2024 tax rules, and Section 112A exemption.
        </p>
      </div>

      <div className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Holding context */}
        <div className="rounded-xl border border-border bg-surface-muted/40 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-foreground-muted">Asset: </span>
            <span className="font-semibold text-foreground">{asset.name}</span>
          </div>
          <div>
            <span className="text-foreground-muted">Total Available: </span>
            <span className="font-mono font-semibold text-foreground">
              {formatMicroUnits(currentTotalMicro)} units
            </span>
          </div>
          {quoteMicroRupees !== undefined && (
            <div>
              <span className="text-foreground-muted">Current NAV: </span>
              <span className="font-mono font-semibold text-foreground">
                ₹{formatPricePerUnit(quoteMicroRupees)}
              </span>
            </div>
          )}
        </div>

        {/* Form inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Units to Sell</label>
            <input
              type="text"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder="e.g. 50.000000"
              className="w-full rounded-xl border border-border bg-surface-muted/60 px-3 py-2 text-xs text-foreground font-mono focus:border-accent focus:outline-none"
            />
            <div className="flex gap-1 pt-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPercentage(pct)}
                  className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted hover:bg-accent/10 hover:text-accent"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">
              Price / NAV Override (₹)
            </label>
            <input
              type="text"
              value={quoteOverrideInput}
              onChange={(e) => setQuoteOverrideInput(e.target.value)}
              placeholder={quoteMicroRupees ? formatPricePerUnit(quoteMicroRupees) : "0.0000"}
              className="w-full rounded-xl border border-border bg-surface-muted/60 px-3 py-2 text-xs text-foreground font-mono focus:border-accent focus:outline-none"
            />
            <p className="text-[10px] text-foreground-muted">Leave blank for live quote</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Other Charges (₹)</label>
            <input
              type="text"
              value={chargesInput}
              onChange={(e) => setChargesInput(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-border bg-surface-muted/60 px-3 py-2 text-xs text-foreground font-mono focus:border-accent focus:outline-none"
            />
            <p className="text-[10px] text-foreground-muted">Brokerage, STT, stamp duty</p>
          </div>
        </div>

        <Button
          type="button"
          disabled={estimateMutation.isPending}
          onClick={calculate}
          className="w-full"
        >
          {estimateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating FIFO Tax Lots...
            </>
          ) : (
            "Calculate Post-Tax Estimate"
          )}
        </Button>

        {/* Results section */}
        {estimate !== undefined && (
          <div className="space-y-4 pt-2">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3">
                <p className="text-[11px] text-foreground-muted">Gross Realization</p>
                <p className="text-base font-bold font-mono text-foreground mt-0.5">
                  ₹{formatMinor(estimate.grossProceedsMinor)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3">
                <p className="text-[11px] text-foreground-muted">Cost Basis</p>
                <p className="text-base font-bold font-mono text-foreground mt-0.5">
                  {estimate.costBasisMinor !== null
                    ? `₹${formatMinor(estimate.costBasisMinor)}`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted/40 p-3">
                <p className="text-[11px] text-foreground-muted">Estimated Gain/Loss</p>
                <p
                  className={`text-base font-bold font-mono mt-0.5 flex items-center gap-1 ${
                    estimate.estimatedGainMinor !== null && estimate.estimatedGainMinor >= 0
                      ? "text-emerald-500"
                      : "text-rose-500"
                  }`}
                >
                  {estimate.estimatedGainMinor !== null
                    ? `${estimate.estimatedGainMinor >= 0 ? "+" : ""}₹${formatMinor(estimate.estimatedGainMinor)}`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-[11px] text-emerald-600 font-semibold">Post-Tax Net</p>
                <p className="text-base font-bold font-mono text-emerald-600 mt-0.5">
                  {estimate.postTaxProceedsMinor !== null
                    ? `₹${formatMinor(estimate.postTaxProceedsMinor)}`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Deductions Breakdown */}
            <div className="rounded-xl border border-border bg-surface-muted/30 p-3.5 space-y-2 text-xs">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <span>Deductions &amp; Charges Breakdown</span>
                <Badge variant="info">Exit Load &amp; STT</Badge>
              </div>
              <div className="space-y-1.5 pt-1 divide-y divide-border">
                {estimate.deductions.exitLoadMinor > 0 && (
                  <div className="flex justify-between py-1 text-foreground-muted">
                    <span>Exit Load</span>
                    <span className="font-mono font-medium text-foreground">
                      ₹{formatMinor(estimate.deductions.exitLoadMinor)}
                    </span>
                  </div>
                )}
                {estimate.deductions.sttMinor > 0 && (
                  <div className="flex justify-between py-1 text-foreground-muted">
                    <span>Securities Transaction Tax (STT)</span>
                    <span className="font-mono font-medium text-foreground">
                      ₹{formatMinor(estimate.deductions.sttMinor)}
                    </span>
                  </div>
                )}
                {estimate.deductions.otherChargesMinor > 0 && (
                  <div className="flex justify-between py-1 text-foreground-muted">
                    <span>Other Charges</span>
                    <span className="font-mono font-medium text-foreground">
                      ₹{formatMinor(estimate.deductions.otherChargesMinor)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 font-bold text-foreground">
                  <span>Total Deductions</span>
                  <span className="font-mono text-rose-500">
                    ₹{formatMinor(estimate.deductions.totalDeductionsMinor)}
                  </span>
                </div>
                {estimate.estimatedTaxMinor !== null && (
                  <div className="flex justify-between pt-1.5 font-bold text-foreground">
                    <span>Estimated Tax</span>
                    <span className="font-mono text-rose-500">
                      ₹{formatMinor(estimate.estimatedTaxMinor)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* FIFO Allocated Lots Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-surface-muted/50 p-2.5 border-b border-border">
                <h4 className="text-xs font-semibold text-foreground">
                  Allocated FIFO Lots ({estimate.lots.length})
                </h4>
              </div>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-surface-muted/30 border-b border-border text-foreground-muted">
                    <tr>
                      <th className="p-2">Acquisition Date</th>
                      <th className="p-2">Holding (Mo)</th>
                      <th className="p-2">Term</th>
                      <th className="p-2 text-right">Units</th>
                      <th className="p-2 text-right">Cost (₹)</th>
                      <th className="p-2 text-right">Gain / Loss (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {estimate.lots.map((lot, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-mono">
                          {lot.acquiredAt !== null
                            ? dateFormatter.format(new Date(lot.acquiredAt))
                            : "—"}
                        </td>
                        <td className="p-2 font-mono">
                          {lot.holdingPeriodMonths !== null ? `${lot.holdingPeriodMonths}m` : "—"}
                        </td>
                        <td className="p-2">
                          <Badge variant={lot.term === "long_term" ? "success" : "accent"}>
                            {lot.term === "long_term" ? "LTCG" : "STCG"}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {formatMicroUnits(lot.quantityMicroUnits)}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {lot.costBasisMinor !== null
                            ? `₹${formatMinor(lot.costBasisMinor)}`
                            : "—"}
                        </td>
                        <td
                          className={`p-2 text-right font-mono font-semibold ${
                            lot.gainLossMinor !== null && lot.gainLossMinor >= 0
                              ? "text-emerald-500"
                              : "text-rose-500"
                          }`}
                        >
                          {lot.gainLossMinor !== null
                            ? `${lot.gainLossMinor >= 0 ? "+" : ""}₹${formatMinor(lot.gainLossMinor)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </DialogSurface>
  );
}

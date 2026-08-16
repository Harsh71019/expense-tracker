"use client";

import { Calculator, History, RotateCcw, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function InvariantPaiseCalculator(): ReactNode {
  const [rupeesInput, setRupeesInput] = useState("1249.50");

  const num = Number.parseFloat(rupeesInput.trim());
  const isValid = !Number.isNaN(num) && num >= 0;
  const minorUnits = isValid ? Math.round(num * 100) : 0;
  const standardFloatMultiply = isValid ? num * 100 : 0;
  const hasFloatArtifact = isValid && standardFloatMultiply.toString().includes(".");

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-surface-muted/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-accent" aria-hidden={true} />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Interactive Paise Math Verifier
          </h4>
        </div>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-2xs font-bold text-accent">
          IEEE-754 Safe
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="rupee-math-input"
            className="block text-2xs font-semibold text-foreground-muted"
          >
            Enter Amount in INR (₹)
          </label>
          <div className="relative mt-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 font-mono text-xs text-foreground-muted">
              ₹
            </span>
            <input
              id="rupee-math-input"
              type="text"
              value={rupeesInput}
              onChange={(e) => setRupeesInput(e.target.value)}
              placeholder="e.g. 1249.50"
              className="h-9 w-full rounded-lg border border-border bg-surface-elevated pl-7 pr-3 font-mono text-xs text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-lg border border-border bg-surface-elevated p-2.5">
          <p className="text-2xs font-semibold text-foreground-muted">
            Computed Minor Units (Paise)
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-mono text-lg font-bold text-accent">
              {isValid ? `${minorUnits.toLocaleString("en-IN")} paise` : "Invalid amount"}
            </span>
            <span className="font-mono text-2xs text-foreground-muted">
              ({isValid ? `₹${(minorUnits / 100).toFixed(2)}` : ""})
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-surface-elevated/70 p-2.5 font-mono text-2xs text-foreground-muted">
        <div className="flex items-center justify-between">
          <span>Raw Floating Multiplier: {isValid ? standardFloatMultiply.toString() : "0"}</span>
          <span className={hasFloatArtifact ? "text-expense font-bold" : "text-income font-bold"}>
            {hasFloatArtifact
              ? "⚠ Floating artifact detected & eliminated"
              : "✓ Exact integer representation"}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SimulatedEntry {
  id: string;
  type: "ORIGINAL_EXPENSE" | "COMPENSATING_REVERSAL";
  description: string;
  amountMinor: number;
  signedPaise: number;
  timestamp: string;
}

export function InvariantReversalSimulator(): ReactNode {
  const [entries, setEntries] = useState<readonly SimulatedEntry[]>([
    {
      id: "txn_01j9a",
      type: "ORIGINAL_EXPENSE",
      description: "Cloud Server Hosting (Original Post)",
      amountMinor: 249900,
      signedPaise: -249900,
      timestamp: "14:20:00 UTC"
    }
  ]);

  const hasReversal = entries.some((entry) => entry.type === "COMPENSATING_REVERSAL");
  const netPaise = entries.reduce((acc, curr) => acc + curr.signedPaise, 0);

  function handleAddReversal(): void {
    if (hasReversal) return;
    const reversal: SimulatedEntry = {
      id: "rev_01j9b",
      type: "COMPENSATING_REVERSAL",
      description: "Compensating Reversal for txn_01j9a",
      amountMinor: 249900,
      signedPaise: 249900,
      timestamp: "14:22:15 UTC"
    };
    setEntries((prev) => [...prev, reversal]);
  }

  function handleReset(): void {
    setEntries([
      {
        id: "txn_01j9a",
        type: "ORIGINAL_EXPENSE",
        description: "Cloud Server Hosting (Original Post)",
        amountMinor: 249900,
        signedPaise: -249900,
        timestamp: "14:20:00 UTC"
      }
    ]);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-surface-muted/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-accent" aria-hidden={true} />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Append-Only Reversal Simulator
          </h4>
        </div>

        <div className="flex items-center gap-2">
          {!hasReversal ? (
            <Button size="sm" variant="primary" onClick={handleAddReversal}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden={true} />
              Post Compensating Reversal
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handleReset}>
              Reset Simulation
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated p-2.5 text-xs animate-fade-in"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-6 w-6 place-items-center rounded-md font-mono text-2xs font-bold ${
                  entry.type === "ORIGINAL_EXPENSE"
                    ? "border border-expense/30 bg-expense/10 text-expense"
                    : "border border-income/30 bg-income/10 text-income"
                }`}
              >
                {entry.type === "ORIGINAL_EXPENSE" ? "DR" : "CR"}
              </span>
              <div>
                <p className="font-bold text-foreground">{entry.description}</p>
                <p className="font-mono text-2xs text-foreground-muted">
                  ID: {entry.id} · Timestamp: {entry.timestamp}
                </p>
              </div>
            </div>

            <div className="text-right font-mono">
              <p className={`font-bold ${entry.signedPaise < 0 ? "text-expense" : "text-income"}`}>
                {entry.signedPaise < 0 ? "-₹2,499.00" : "+₹2,499.00"}
              </p>
              <p className="text-2xs text-foreground-muted">
                {entry.amountMinor.toLocaleString("en-IN")} paise
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Net Ledger Balance Result */}
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-surface-elevated/90 p-2.5 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <ShieldCheck
            className={`h-4 w-4 ${netPaise === 0 ? "text-income" : "text-foreground-muted"}`}
            aria-hidden={true}
          />
          <span className="font-bold text-foreground">Net Ledger Balance Impact:</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${netPaise === 0 ? "text-income" : "text-expense"}`}>
            {netPaise === 0
              ? "₹0.00 (0 paise · Perfectly Neutralized)"
              : "-₹2,499.00 (-249900 paise)"}
          </span>
          {netPaise === 0 && (
            <span className="inline-flex items-center rounded-md bg-income/15 px-2 py-0.5 text-2xs font-bold text-income">
              Audit Preserved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

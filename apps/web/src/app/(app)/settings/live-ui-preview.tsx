"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Sparkles,
  TrendingUp,
  Zap
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

export function LiveUiPreview(): ReactNode {
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "tokens">("overview");
  const [copiedPaise, setCopiedPaise] = useState(false);

  function copyMathSnippet(): void {
    void navigator.clipboard.writeText("amountMinor = Math.round(rupees * 100);");
    setCopiedPaise(true);
    toast.success("Integer math formula copied to clipboard");
    setTimeout(() => setCopiedPaise(false), 2000);
  }

  return (
    <div className="glass-card space-y-4 rounded-2xl p-4 sm:p-5 shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-glow text-accent font-bold text-xs ring-1 ring-accent/20">
            <Sparkles className="h-3.5 w-3.5" aria-hidden={true} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Live Interface Preview</h3>
            <p className="text-2xs text-foreground-muted">
              Real-time rendering of your active theme &amp; accent palette
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-surface-muted/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition-colors ${
              activeTab === "overview"
                ? "bg-surface-elevated text-foreground shadow-2xs font-bold"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            Overview Card
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition-colors ${
              activeTab === "transactions"
                ? "bg-surface-elevated text-foreground shadow-2xs font-bold"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            Ledger Rows
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tokens")}
            className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition-colors ${
              activeTab === "tokens"
                ? "bg-surface-elevated text-foreground shadow-2xs font-bold"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            Paise Math
          </button>
        </div>
      </header>

      {/* Tab 1: Overview Card */}
      {activeTab === "overview" && (
        <div className="space-y-3.5 animate-fade-in">
          <div className="relative overflow-hidden rounded-xl border border-border/80 bg-surface-elevated p-4 shadow-2xs">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground shadow-xs">
                  <span className="font-mono text-base font-extrabold">₹</span>
                </span>
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-foreground-muted">
                    Treasury Reserve
                  </p>
                  <p className="font-mono text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                    ₹1,24,500.00
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-2xs font-bold text-income">
                <TrendingUp className="h-3 w-3" aria-hidden={true} />
                <span>+12.4%</span>
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-glow px-2 py-0.5 font-mono text-2xs font-bold text-accent">
                <Zap className="h-3 w-3" aria-hidden={true} />
                <span>Active Accent</span>
              </span>
              <span className="font-mono text-2xs text-foreground-muted">
                12,450,000 integer paise
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary">
              Primary Accent Action
            </Button>
            <Button size="sm" variant="secondary">
              Secondary Outline
            </Button>
            <Button size="sm" variant="ghost">
              Ghost Link
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2: Transaction Rows */}
      {activeTab === "transactions" && (
        <div className="space-y-2 animate-fade-in">
          {/* Income Item */}
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-elevated p-3 transition-colors hover:border-accent/40">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-income/30 bg-income/10 text-income">
                <ArrowDownLeft className="h-4 w-4" aria-hidden={true} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Direct Deposit · Payroll</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="rounded bg-surface-muted px-1.5 py-0.2 font-mono text-2xs text-foreground-muted">
                    Income
                  </span>
                  <span className="text-2xs text-foreground-muted">SBI Corporate · Today</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs font-bold text-income">+₹85,000.00</p>
              <Badge variant="success">Cleared</Badge>
            </div>
          </div>

          {/* Expense Item */}
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-elevated p-3 transition-colors hover:border-accent/40">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-expense/30 bg-expense/10 text-expense">
                <ArrowUpRight className="h-4 w-4" aria-hidden={true} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Cloud Server · VPS Hosting</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="rounded bg-surface-muted px-1.5 py-0.2 font-mono text-2xs text-foreground-muted">
                    Hosting
                  </span>
                  <span className="text-2xs text-foreground-muted">HDFC Credit · Yesterday</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs font-bold text-expense">-₹2,499.00</p>
              <Badge variant="accent">Settled</Badge>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Paise Math Token Display */}
      {activeTab === "tokens" && (
        <div className="space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-xl border border-accent/30 bg-accent-glow/30 p-2.5 text-center">
              <span className="font-mono text-2xs font-bold text-accent uppercase">Accent</span>
              <span className="text-xs font-bold text-foreground">Active Token</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-income/30 bg-income/10 p-2.5 text-center">
              <span className="font-mono text-2xs font-bold text-income uppercase">Income</span>
              <span className="text-xs font-bold text-income">+ Positive</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-expense/30 bg-expense/10 p-2.5 text-center">
              <span className="font-mono text-2xs font-bold text-expense uppercase">Expense</span>
              <span className="text-xs font-bold text-expense">- Outflow</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-muted p-2.5 text-center">
              <span className="font-mono text-2xs font-bold text-foreground-muted uppercase">
                Surface
              </span>
              <span className="text-xs font-bold text-foreground">Elevated</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-surface-muted/60 p-3 font-mono text-2xs">
            <div className="space-y-0.5">
              <p className="font-bold text-foreground">Paise Formula (Integer Minor Units)</p>
              <p className="text-foreground-muted">amountMinor = Math.round(rupees * 100)</p>
            </div>
            <button
              type="button"
              onClick={copyMathSnippet}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-2.5 py-1 text-2xs font-bold text-foreground hover:border-accent/40 hover:text-accent"
            >
              {copiedPaise ? (
                <CheckCircle2 className="h-3 w-3 text-income" aria-hidden={true} />
              ) : (
                <Copy className="h-3 w-3" aria-hidden={true} />
              )}
              <span>{copiedPaise ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

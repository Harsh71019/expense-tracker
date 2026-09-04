"use client";

import type { SafetyEvaluation } from "@treasury-ops/shared";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { DialogSurface } from "@/components/ui/dialog";
import { formatLimitationKey } from "../model/runway-presentation";

export interface SafetyEvidenceDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly evaluation: SafetyEvaluation | null;
}

/**
 * Traceable calculation evidence behind the Safety Evaluation -- source
 * values, dates, exclusions, and the runway formula. Every amount goes
 * through `<Money>`/`formatMinor`, never a hand-divided display string.
 */
export function SafetyEvidenceDrawer({
  open,
  onClose,
  evaluation
}: SafetyEvidenceDrawerProps): ReactNode {
  if (!open || evaluation === null) return null;

  const {
    runway,
    target,
    essentialBurnEvidence,
    reserveEvidence,
    protectionEvidence,
    debtEvidence
  } = evaluation;

  return (
    <DialogSurface
      labelledBy="safety-evidence-title"
      describedBy="safety-evidence-description"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[560px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Financial Safety
          </p>
          <h2 id="safety-evidence-title" className="mt-1 text-xl font-bold text-foreground">
            Calculation evidence
          </h2>
          <p id="safety-evidence-description" className="mt-0.5 text-xs text-foreground-muted">
            Computed{" "}
            {new Date(evaluation.computedAt).toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit"
            })}{" "}
            · source through{" "}
            {new Date(evaluation.sourceThrough).toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
              year: "numeric"
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close calculation evidence"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-5">
        <section className="rounded-2xl border border-border bg-surface-muted/40 p-4">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            Runway formula
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <dt className="text-foreground-muted">Eligible reserves</dt>
              <dd className="font-semibold text-foreground">
                {runway.eligibleReserveMinor !== null ? (
                  <Money minor={runway.eligibleReserveMinor} size="sm" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Essential burn</dt>
              <dd className="font-semibold text-foreground">
                {runway.essentialBurnMinor !== null ? (
                  <Money minor={runway.essentialBurnMinor} size="sm" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Critical threshold</dt>
              <dd className="font-semibold text-foreground">
                {runway.criticalThresholdBasisPoints / 10_000} months
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Fortified threshold</dt>
              <dd className="font-semibold text-foreground">
                {runway.fortifiedThresholdBasisPoints / 10_000} months
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Planning days per month</dt>
              <dd className="font-semibold text-foreground">{runway.policyDaysPerMonth}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Months observed</dt>
              <dd className="font-semibold text-foreground">
                {runway.observedCompleteMonthCount} of 3
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-2xs text-foreground-muted">
            runway months = eligible reserves ÷ essential burn, using integer basis points (10,000 =
            one month). Formula version {evaluation.formulaVersion}, policy version{" "}
            {evaluation.policyVersion}.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            Safety target
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <dt className="text-foreground-muted">Policy target (6 months)</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={target.policyTargetMinor} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Effective target</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={target.effectiveTargetMinor} size="sm" />
                <span className="ml-1 text-2xs text-foreground-muted">
                  ({target.targetSource === "user_preference" ? "your preference" : "policy"})
                </span>
              </dd>
            </div>
            {target.currentGapMinor > 0 ? (
              <div className="col-span-2">
                <dt className="text-foreground-muted">Remaining gap</dt>
                <dd className="font-semibold text-foreground">
                  <Money minor={target.currentGapMinor} size="sm" />
                </dd>
              </div>
            ) : (
              <div className="col-span-2">
                <dt className="text-foreground-muted">Surplus above target</dt>
                <dd className="font-semibold text-foreground">
                  <Money minor={target.currentSurplusMinor} size="sm" />
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            Reserve composition
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <dt className="text-foreground-muted">Instant access</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={reserveEvidence.instantMinor} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">T+1 access</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={reserveEvidence.tPlusOneMinor} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Locked / excluded</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={reserveEvidence.lockedMinor} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Stale-excluded</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={reserveEvidence.staleExcludedMinor} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Eligible sources</dt>
              <dd className="font-semibold text-foreground">
                {reserveEvidence.currentlyEligibleSourceCount} of{" "}
                {reserveEvidence.configuredSourceCount} configured
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            Essential burn evidence
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <dt className="text-foreground-muted">Average monthly essential spend</dt>
              <dd className="font-semibold text-foreground">
                {essentialBurnEvidence.averageMonthlyEssentialMinor !== null ? (
                  <Money minor={essentialBurnEvidence.averageMonthlyEssentialMinor} size="sm" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Quality</dt>
              <dd className="font-semibold text-foreground capitalize">
                {essentialBurnEvidence.quality}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            Protection benchmark basis
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <dt className="text-foreground-muted">Term benchmark (10x income)</dt>
              <dd className="font-semibold text-foreground">
                {protectionEvidence.termBenchmarkMinor !== null ? (
                  <Money minor={protectionEvidence.termBenchmarkMinor} size="sm" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Health benchmark</dt>
              <dd className="font-semibold text-foreground">
                <Money minor={protectionEvidence.healthBenchmarkMinor} size="sm" />
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-foreground-muted">Income basis</dt>
              <dd className="font-semibold text-foreground capitalize">
                {protectionEvidence.incomeBasis.replace(/_/g, " ")} (
                {protectionEvidence.incomeBasisQuality})
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
            High-cost debt
          </h3>
          <p className="mt-2 text-xs text-foreground-muted">
            {debtEvidence.highCostDebtCount} high-cost of {debtEvidence.activeDebtCount} active
            declared debts.
          </p>
        </section>

        {evaluation.limitations.length > 0 ? (
          <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
            <h3 className="text-xs font-mono font-bold tracking-wider text-foreground uppercase">
              Limitations
            </h3>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-2xs text-foreground-muted">
              {evaluation.limitations.map((key) => (
                <li key={key}>{formatLimitationKey(key)}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </DialogSurface>
  );
}

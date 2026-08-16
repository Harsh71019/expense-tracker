"use client";

import type { ProtectionCoverageSummary, ProtectionState } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";

import {
  COVERAGE_STATE_LABELS,
  EXPIRY_STATE_LABELS,
  isSettledCoverageState
} from "../model/protection-form";

type ProtectionSummaryProps = Readonly<{ state: ProtectionState | null }>;

/**
 * The read side of the protection section.
 *
 * Deliberately conservative: a settled answer gets a neutral "Recorded" badge,
 * never a green "you are safe" verdict, because being covered is not the same
 * as being adequately covered — and adequacy is not something this feature
 * computes.
 */
export function ProtectionSummary({ state }: ProtectionSummaryProps): ReactNode {
  if (state === null) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-expense/30 bg-expense/5 px-4 py-3 text-sm text-foreground-muted"
      >
        We could not load your protection answers just now. Reload the page to try again — nothing
        has been changed.
      </p>
    );
  }

  if (!state.configured) {
    return (
      <div className="rounded-2xl border border-border bg-surface-muted/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">Protection not recorded yet</h3>
          <Badge variant="pending">Unknown</Badge>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">
          Nothing is assumed on your behalf. Until you answer, your term and health cover are
          treated as unknown — not as covered, and not as uncovered.
        </p>
      </div>
    );
  }

  const snapshot = state.currentSnapshot;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CoverCard
          title="Term life cover"
          summary={state.termCover}
          independentLabel="Your own policy"
          independentMinor={snapshot?.independentTermCoverMinor ?? null}
          employerLabel="Employer cover"
          employerMinor={snapshot?.employerTermCoverMinor ?? null}
        />
        <CoverCard
          title="Health cover"
          summary={state.healthCover}
          independentLabel="Your own base cover"
          independentMinor={snapshot?.independentHealthBaseCoverMinor ?? null}
          employerLabel="Employer cover"
          employerMinor={snapshot?.employerHealthCoverMinor ?? null}
          extraLabel="Super top-up"
          extraMinor={snapshot?.independentHealthSuperTopUpMinor ?? null}
        />
      </div>

      <dl className="grid gap-3 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Dependants
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {snapshot?.dependantCount ?? 0}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Answers effective from
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {snapshot === null ? "—" : formatDate(snapshot.effectiveFrom)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Data quality
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground capitalize">
            {state.dataQuality}
          </dd>
        </div>
      </dl>

      {state.upcomingSnapshot === null ? null : (
        <p
          role="status"
          className="rounded-2xl border border-accent/30 bg-accent-glow/30 px-4 py-3 text-xs text-foreground-muted"
        >
          A future-dated set of answers takes effect on{" "}
          <strong className="text-foreground">
            {formatDate(state.upcomingSnapshot.effectiveFrom)}
          </strong>
          . The summary above shows what applies today.
        </p>
      )}

      {state.limitations.length === 0 ? null : (
        <section aria-labelledby="protection-limitations-title" className="space-y-1.5">
          <h4
            id="protection-limitations-title"
            className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase"
          >
            What is still unclear
          </h4>
          <ul className="space-y-1 text-xs text-foreground-muted">
            {state.limitations.map((limitation) => (
              <li key={limitation} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{limitation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type CoverCardProps = Readonly<{
  title: string;
  summary: ProtectionCoverageSummary;
  independentLabel: string;
  independentMinor: number | null;
  employerLabel: string;
  employerMinor: number | null;
  extraLabel?: string;
  extraMinor?: number | null;
}>;

function CoverCard({
  title,
  summary,
  independentLabel,
  independentMinor,
  employerLabel,
  employerMinor,
  extraLabel,
  extraMinor
}: CoverCardProps): ReactNode {
  const stateLabel = COVERAGE_STATE_LABELS[summary.state];
  const descriptionId = `${title.replaceAll(" ", "-").toLowerCase()}-state-description`;

  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {/* Never a success variant on its own: colour must not be the signal. */}
        <Badge variant={isSettledCoverageState(summary.state) ? "info" : "pending"}>
          {stateLabel}
        </Badge>
      </div>

      <p id={descriptionId} className="text-xs leading-relaxed text-foreground-muted">
        {describeState(summary)}
      </p>

      <dl className="space-y-1.5 text-xs">
        <AmountRow label={independentLabel} minor={independentMinor} />
        {extraLabel === undefined ? null : (
          <AmountRow label={extraLabel} minor={extraMinor ?? null} />
        )}
        <AmountRow label={employerLabel} minor={employerMinor} />
        {summary.expiresOn === null ? null : (
          <div className="flex items-center justify-between gap-3 pt-1">
            <dt className="text-foreground-muted">Policy expiry</dt>
            <dd className="font-semibold text-foreground">
              {formatDate(summary.expiresOn)}{" "}
              <span className="font-normal text-foreground-muted">
                ({EXPIRY_STATE_LABELS[summary.expiryState]})
              </span>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function AmountRow({ label, minor }: Readonly<{ label: string; minor: number | null }>): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-semibold text-foreground">
        {minor === null ? (
          <span className="text-foreground-muted">Not recorded</span>
        ) : (
          <Money minor={minor} />
        )}
      </dd>
    </div>
  );
}

function describeState(summary: ProtectionCoverageSummary): string {
  switch (summary.state) {
    case "not_configured":
      return "No answer recorded yet, so this is treated as unknown.";
    case "unknown":
      return "Recorded as “not sure”. It is treated as unknown, never as covered.";
    case "incomplete":
      return "You recorded cover but not its amount, so it cannot be assessed yet.";
    case "employer_only":
      return "Employer-provided only. Cover of this kind usually ends when the employment does.";
    case "none_declared":
      return "You told us there is no cover here today.";
    case "not_applicable":
      return "You told us this does not apply to you, with a reason on file.";
    case "complete":
      return "Recorded with an amount. This says what you hold, not whether it is enough.";
    default:
      return "";
  }
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  });
}

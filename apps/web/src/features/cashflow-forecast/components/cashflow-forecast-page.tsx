import type { CashflowForecastSnapshot } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";

import type { CashflowForecasts } from "../server/get-cashflow-forecasts";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});
const timestampFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata"
});

type Horizon = 30 | 60 | 90;
type CashflowForecastPageProps = Readonly<{ forecasts: CashflowForecasts; selectedDays: Horizon }>;

function coverageLabel(coverageBps: number | null): string {
  if (coverageBps === null) return "Not measured";
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(coverageBps / 100)}%`;
}

function modelLabel(model: CashflowForecastSnapshot["model"]): string {
  return model.replaceAll("_", " ");
}

function shortfallDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00+05:30`));
}

function isSupported(
  snapshot: CashflowForecastSnapshot | null
): snapshot is CashflowForecastSnapshot {
  return (
    snapshot !== null &&
    snapshot.metrics.eligibleForHorizon &&
    snapshot.metrics.observedCoverageBps !== null &&
    snapshot.metrics.evaluatedOriginCount > 0
  );
}

function ForecastTabs({ forecasts, selectedDays }: CashflowForecastPageProps): ReactNode {
  const choices: readonly Horizon[] = [30, 60, 90];
  const byHorizon: Record<Horizon, CashflowForecastSnapshot | null> = {
    30: forecasts.thirtyDay,
    60: forecasts.sixtyDay,
    90: forecasts.ninetyDay
  };
  return (
    <nav
      aria-label="Cash-flow forecast horizon"
      className="inline-flex rounded-xl border border-border bg-surface-muted p-1"
    >
      {choices.map((days) => {
        const supported = days === 30 || isSupported(byHorizon[days]);
        if (!supported) return null;
        const active = days === selectedDays;
        return (
          <Link
            key={days}
            href={`/cash-flow?days=${days}`}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? "bg-surface-elevated text-accent shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {days} days
          </Link>
        );
      })}
    </nav>
  );
}

function UnavailableForecast({
  title,
  description
}: Readonly<{ title: string; description: string }>): ReactNode {
  return (
    <section
      aria-labelledby="cash-flow-status"
      className="rounded-2xl border border-border bg-surface-elevated p-6"
    >
      <h2 id="cash-flow-status" className="text-lg font-bold text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">{description}</p>
    </section>
  );
}

function ForecastDetails({
  forecast
}: Readonly<{ forecast: CashflowForecastSnapshot }>): ReactNode {
  const degraded = forecast.resources.outcome.status === "degraded";
  const insufficient = forecast.sufficiency.status === "insufficient";
  return (
    <>
      {degraded ? (
        <p
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground"
        >
          This snapshot is degraded because the forecast worker reached a resource limit. Treat the
          range as incomplete evidence.
        </p>
      ) : null}
      {insufficient ? (
        <p
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground"
        >
          Insufficient history: {forecast.sufficiency.observationCount} of{" "}
          {forecast.sufficiency.minimumRequired} required daily observations are available. Only
          known scheduled cash flows are included; variable spending is not estimated.
        </p>
      ) : null}
      <section
        aria-labelledby="forecast-result"
        className="rounded-2xl border border-border bg-surface-elevated p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="forecast-result" className="text-lg font-bold tracking-tight text-foreground">
              Projected balance
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Point estimate at the end of this horizon.
            </p>
          </div>
          <SignedMoney minor={forecast.pointBalanceMinor} size="hero" />
        </div>
        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Historical range</p>
            <p className="mt-1 text-sm text-foreground-muted">
              A calibrated range from past forecast errors; it is not a guarantee.
            </p>
            <p
              className="mt-3 flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground"
              aria-label="Projected balance range"
            >
              <SignedMoney minor={forecast.range.lowerMinor} size="lg" />{" "}
              <span aria-hidden="true">to</span>{" "}
              <SignedMoney minor={forecast.range.upperMinor} size="lg" />
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Observed range coverage</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {coverageLabel(forecast.metrics.observedCoverageBps)}
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              Measured across {forecast.metrics.evaluatedOriginCount} historical forecast origins.
            </p>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="forecast-components"
        className="rounded-2xl border border-border bg-surface-elevated p-6"
      >
        <h2 id="forecast-components" className="text-lg font-bold text-foreground">
          What this view includes
        </h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-foreground-muted">Liquid cash today</dt>
            <dd className="mt-1">
              <SignedMoney minor={forecast.assumptions.liquidBalanceMinor} size="lg" />
            </dd>
            <p className="mt-1 text-xs text-foreground-muted">
              Excludes investment balances and available credit.
            </p>
          </div>
          <div>
            <dt className="text-sm text-foreground-muted">Recurring inflows</dt>
            <dd className="mt-1">
              <Money
                minor={forecast.assumptions.knownRecurringInflowMinor}
                variant="income"
                signed
                size="lg"
              />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-foreground-muted">Recurring outflows</dt>
            <dd className="mt-1">
              <Money
                minor={forecast.assumptions.knownRecurringOutflowMinor}
                variant="expense"
                signed
                size="lg"
              />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-foreground-muted">Bills due</dt>
            <dd className="mt-1">
              <Money
                minor={forecast.assumptions.creditCardBillsDueMinor}
                variant="expense"
                signed
                size="lg"
              />
            </dd>
            <p className="mt-1 text-xs text-foreground-muted">
              Card purchases already represented in a due bill are excluded.
            </p>
          </div>
        </dl>
        <p className="mt-5 border-t border-border pt-4 text-sm text-foreground-muted">
          <span className="font-semibold text-foreground">Variable spending:</span> included in the
          point estimate and historical range when history is sufficient. The API intentionally does
          not expose a separate variable-spend amount.
        </p>
      </section>
      <section
        aria-labelledby="forecast-evidence"
        className="rounded-2xl border border-border bg-surface-elevated p-6"
      >
        <h2 id="forecast-evidence" className="text-lg font-bold text-foreground">
          Evidence and assumptions
        </h2>
        <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-foreground-muted">As of (Asia/Kolkata)</dt>
            <dd className="mt-1 font-medium text-foreground">
              {timestampFormatter.format(forecast.asOf)}
            </dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Data sufficiency</dt>
            <dd className="mt-1 font-medium text-foreground">
              {forecast.sufficiency.status === "sufficient"
                ? `${forecast.sufficiency.observationCount} observations (minimum ${forecast.sufficiency.minimumRequired})`
                : `${forecast.sufficiency.observationCount} observations; ${forecast.sufficiency.reason.replaceAll("_", " ")}`}
            </dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Model</dt>
            <dd className="mt-1 font-medium capitalize text-foreground">
              {modelLabel(forecast.model)}
            </dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Algorithm version</dt>
            <dd className="mt-1 font-medium text-foreground">v{forecast.modelVersion}</dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Historical error</dt>
            <dd className="mt-1 font-medium text-foreground">
              {forecast.metrics.maeMinor === null ? (
                "Not measured"
              ) : (
                <Money minor={forecast.metrics.maeMinor} />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Snapshot computed</dt>
            <dd className="mt-1 font-medium text-foreground">
              {timestampFormatter.format(forecast.computedAt)}
            </dd>
          </div>
        </dl>
      </section>
      {forecast.shortfall.hasPotentialShortfall &&
      forecast.shortfall.firstPotentialShortfallDate !== null ? (
        <section
          aria-labelledby="shortfall-heading"
          className="rounded-2xl border border-expense/40 bg-expense/10 p-6"
        >
          <h2 id="shortfall-heading" className="text-lg font-bold text-foreground">
            Potential cash shortfall
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            The conservative end of the historical range reaches{" "}
            <SignedMoney minor={forecast.shortfall.conservativeBalanceMinor} /> by{" "}
            {shortfallDate(forecast.shortfall.firstPotentialShortfallDate)}. This is read-only
            decision support, not a recommendation or an automatic action.
          </p>
        </section>
      ) : null}
    </>
  );
}

export function CashflowForecastPage({
  forecasts,
  selectedDays
}: CashflowForecastPageProps): ReactNode {
  const selected =
    selectedDays === 30
      ? forecasts.thirtyDay
      : selectedDays === 60
        ? forecasts.sixtyDay
        : forecasts.ninetyDay;
  const fallback = forecasts.thirtyDay;
  if (selected === null && fallback === null) {
    return (
      <UnavailableForecast
        title="Cash-flow forecast is not ready"
        description="No forecast snapshot is available yet. This read-only view will appear after the forecast worker has enough current data to save a snapshot."
      />
    );
  }
  const forecast = selected ?? fallback;
  if (forecast === null) return null;
  return (
    <section className="space-y-5">
      <header className="max-w-3xl">
        <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Planning · read-only
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Cash-flow forecast
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          A personal projection based on your posted history, confirmed recurring cash flows, and
          bills due. It does not move money, send notifications, or provide individualized financial
          advice.
        </p>
        <div className="mt-5">
          <ForecastTabs forecasts={forecasts} selectedDays={forecast.horizonDays} />
        </div>
        {(forecasts.sixtyDay !== null && !isSupported(forecasts.sixtyDay)) ||
        (forecasts.ninetyDay !== null && !isSupported(forecasts.ninetyDay)) ? (
          <p className="mt-3 text-sm text-foreground-muted">
            Longer horizons remain hidden until their own measured accuracy and coverage meet the
            backend eligibility criteria.
          </p>
        ) : null}
      </header>
      <ForecastDetails forecast={forecast} />
    </section>
  );
}

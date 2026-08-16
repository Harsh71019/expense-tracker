"use client";

import { formatMinor, type Account, type DetectedStreamPage } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { generateRequestId } from "@/lib/request-id";
import { toast } from "@/lib/toast";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type Props = Readonly<{ initialPage: DetectedStreamPage; accounts: Account[] }>;

export function DetectedStreamReviewPanel({ initialPage, accounts }: Props): ReactNode {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [busyStreamId, setBusyStreamId] = useState<string | null>(null);
  const [items, setItems] = useState(initialPage.items);
  async function decide(streamId: string, decision: "accept" | "reject"): Promise<void> {
    setBusyStreamId(streamId);
    try {
      if (decision === "accept") {
        const result = await apiClient.POST("/v1/recurring/detected/{streamId}/accept", {
          params: { path: { streamId }, header: { "Idempotency-Key": generateRequestId() } },
          body: { accountId, autoPost: false }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        setItems((current) => current.filter((item) => item.stream.id !== streamId));
        toast.success("Recurring rule created for future review.");
      } else {
        const result = await apiClient.POST("/v1/recurring/detected/{streamId}/reject", {
          params: { path: { streamId }, header: { "Idempotency-Key": generateRequestId() } },
          body: {}
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        setItems((current) => current.filter((item) => item.stream.id !== streamId));
        toast.success("Suggestion dismissed.");
      }
    } catch {
      toast.error("This suggestion may have changed. Refresh and try again.");
    } finally {
      setBusyStreamId(null);
    }
  }
  if (items.length === 0)
    return (
      <section
        aria-label="Detected recurring streams"
        className="rounded-2xl border border-border bg-surface-elevated p-5 text-sm text-foreground-muted"
      >
        No recurring suggestions need review. Detection can abstain when the available evidence is
        limited.
      </section>
    );
  return (
    <section
      aria-label="Detected recurring streams"
      className="space-y-3 rounded-2xl border border-border bg-surface-elevated p-5"
    >
      <div>
        <h2 className="text-base font-bold text-foreground">Recurring suggestions</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          These are estimates from posted history. Accepting creates a future manual-post rule; it
          never changes past transactions.
        </p>
      </div>
      {accounts.length > 1 && (
        <label className="block text-xs text-foreground-muted">
          Use account
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="ml-2 rounded border border-border bg-surface px-2 py-1 text-foreground"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {items.map(({ stream, latestRunStatus }) => (
        <article
          key={stream.id}
          className="rounded-xl border border-border/80 bg-surface-muted/40 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                className={
                  stream.transactionType === "income"
                    ? "font-semibold text-income"
                    : "font-semibold text-expense"
                }
              >
                {stream.transactionType === "income" ? "Inflow" : "Outflow"} ·{" "}
                {formatMinor(stream.medianAmountMinor)}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                {stream.cadence} · {stream.amountBehavior} amount · {stream.confidenceBps / 100}%
                confidence
              </p>
            </div>
            <span className="rounded bg-surface px-2 py-1 text-2xs text-foreground-muted">
              v{stream.detectorVersion}
            </span>
          </div>
          <p className="mt-3 text-xs text-foreground-muted">
            Evidence: {stream.evidence.memberCount} matching payments, cadence stability{" "}
            {stream.evidence.cadenceScore.dateStabilityBps / 100}%, amount variation{" "}
            {formatMinor(stream.madAmountMinor)}.{" "}
            {stream.nextExpectedDate === null
              ? "No next date estimated."
              : `Expected ${dateFormatter.format(new Date(`${stream.nextExpectedDate}T00:00:00+05:30`))}.`}{" "}
            Watermark: {dateFormatter.format(stream.inputWatermark.asOf)}.
          </p>
          {stream.sufficiency.status !== "sufficient" && (
            <p className="mt-2 text-xs text-warning">
              Insufficient evidence: {stream.sufficiency.observationCount} of{" "}
              {stream.sufficiency.minimumRequired} observations.
            </p>
          )}
          {latestRunStatus === "degraded" && (
            <p className="mt-2 text-xs text-warning">
              Detection ran with limited resources; review with care.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              disabled={
                busyStreamId === stream.id ||
                accountId === "" ||
                stream.sufficiency.status !== "sufficient"
              }
              onClick={() => void decide(stream.id, "accept")}
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busyStreamId === stream.id}
              onClick={() => void decide(stream.id, "reject")}
            >
              Dismiss
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}

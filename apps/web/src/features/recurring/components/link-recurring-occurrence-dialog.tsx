"use client";

import type { RecurringOccurrence, Transaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";

import { useLinkRecurringOccurrence } from "../hooks/use-link-recurring-occurrence";
import { useOutstandingRecurringOccurrences } from "../hooks/use-outstanding-recurring-occurrences";
import { useRecurringRules } from "../hooks/use-recurring-rules";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function isLinkableRecurringOccurrenceSource(transaction: Transaction): boolean {
  return transaction.status === "posted" && transaction.recurringRuleId === undefined;
}

export function LinkRecurringOccurrenceDialog({
  transaction,
  onClose
}: Readonly<{ transaction: Transaction; onClose: () => void }>): ReactNode {
  const outstanding = useOutstandingRecurringOccurrences();
  const rules = useRecurringRules([]);
  const ruleMap = new Map((rules.data ?? []).map((rule) => [rule.id, rule]));

  const eligible: RecurringOccurrence[] = (outstanding.data ?? []).filter((occurrence) => {
    const rule = ruleMap.get(occurrence.recurringRuleId);
    return (
      rule !== undefined &&
      rule.template.accountId === transaction.accountId &&
      rule.template.type === transaction.type
    );
  });

  const [occurrenceId, setOccurrenceId] = useState(eligible[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const link = useLinkRecurringOccurrence();
  const occurrence = eligible.find((candidate) => candidate.id === occurrenceId);
  const rule = occurrence === undefined ? undefined : ruleMap.get(occurrence.recurringRuleId);

  async function submit(): Promise<void> {
    if (occurrence === undefined || rule === undefined) {
      setError("Choose which recurring rule this transaction paid.");
      return;
    }
    try {
      await link.mutateAsync({
        ruleId: rule.id,
        occurrenceId: occurrence.id,
        transactionId: transaction.id
      });
      toast.success("Linked to the recurring rule");
      onClose();
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not link this payment.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <DialogSurface variant="drawer" labelledBy="link-recurring-occurrence-title" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="link-recurring-occurrence-title" className="text-xl font-bold text-foreground">
            Mark as recurring payment
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Links this transaction to an outstanding occurrence of a manual-post recurring rule,
            without editing it.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <div className="mt-7 space-y-5">
        {eligible.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-foreground-muted">
            No outstanding recurring occurrences match this transaction&rsquo;s account and type.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
            <span>Recurring rule</span>
            <Select
              name="occurrenceId"
              aria-label="Recurring rule"
              options={eligible.map((candidate) => {
                const candidateRule = ruleMap.get(candidate.recurringRuleId);
                return {
                  value: candidate.id,
                  label: `${candidateRule?.template.description ?? "Recurring rule"} — due ${dateFormatter.format(candidate.occurredAt)}`
                };
              })}
              value={occurrenceId}
              onChange={setOccurrenceId}
            />
          </div>
        )}

        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}

        <p className="text-xs leading-relaxed text-foreground-muted">
          This transaction stays exactly as posted. Linking only tags it against the recurring rule,
          so it counts toward that occurrence.
        </p>

        <div className="safe-area-bottom sticky bottom-0 flex gap-2 border-t border-border bg-surface-elevated/95 pt-4 backdrop-blur sm:justify-end">
          <Button
            className="flex-1 sm:flex-none"
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            type="button"
            disabled={link.isPending || occurrence === undefined}
            onClick={() => {
              void submit();
            }}
          >
            {link.isPending ? "Linking…" : "Link payment"}
          </Button>
        </div>
      </div>
    </DialogSurface>
  );
}

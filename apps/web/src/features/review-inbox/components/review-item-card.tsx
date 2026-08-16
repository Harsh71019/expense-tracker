"use client";

import { formatMinor } from "@treasury-ops/shared";
import type {
  ReviewItem,
  ReviewItemDismissReason,
  ReviewItemFeedbackAction
} from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge, Button } from "@/components/ui";

import { ReviewFeedbackDialog } from "./review-feedback-dialog";

interface ReviewItemCardProps {
  readonly item: ReviewItem;
  readonly onDismiss: (itemId: string, reason: ReviewItemDismissReason) => Promise<void>;
  readonly onFeedback: (
    itemId: string,
    action: ReviewItemFeedbackAction,
    rating: number,
    notes?: string
  ) => Promise<void>;
}

export function ReviewItemCard({ item, onDismiss, onFeedback }: ReviewItemCardProps): ReactNode {
  const [showFactors, setShowFactors] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const isActionable = item.status === "active";
  const confidencePct = Math.round(item.confidenceBps / 100);

  const urgencyTier =
    item.priorityScore >= 7_000 ? "High" : item.priorityScore >= 4_000 ? "Medium" : "Low";

  async function handleDismiss(): Promise<void> {
    setIsDismissing(true);
    try {
      await onDismiss(item.id, "not_relevant");
    } finally {
      setIsDismissing(false);
    }
  }

  async function handleFeedbackSubmit(
    action: ReviewItemFeedbackAction,
    rating: number,
    notes?: string
  ): Promise<void> {
    setIsSubmittingFeedback(true);
    try {
      await onFeedback(item.id, action, rating, notes);
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  const getSourceHref = (): string => {
    switch (item.sourceType) {
      case "recurring_change":
      case "recurring_stream":
        return "/recurring";
      case "spending_regime":
        return "/insights";
      case "category_suggestion":
        return "/transactions";
    }
  };

  return (
    <article
      data-testid="review-item-card"
      className="group relative rounded-xl border border-border/80 bg-surface p-4 shadow-sm transition-all hover:border-border"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "active" ? (
            <Badge
              variant={
                urgencyTier === "High" ? "problem" : urgencyTier === "Medium" ? "accent" : "info"
              }
              pulse={urgencyTier === "High"}
            >
              {urgencyTier} Priority • {item.priorityScore} bps
            </Badge>
          ) : (
            <Badge variant="pending">{item.status.toUpperCase()}</Badge>
          )}

          <Badge variant="info">{item.sourceType.replace("_", " ").toUpperCase()}</Badge>

          <span className="font-mono text-2xs text-foreground-muted">
            {confidencePct}% confidence
          </span>
        </div>

        {item.amountMinor !== null ? (
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatMinor(item.amountMinor)}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5">
        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        <p className="mt-0.5 text-xs text-foreground-muted leading-relaxed">{item.subtitle}</p>
      </div>

      {showFactors ? (
        <div
          data-testid="priority-factors-panel"
          className="mt-3 rounded-lg border border-border/60 bg-surface-muted/50 p-3 text-xs space-y-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-2xs">
            <div>
              <span className="text-foreground-muted block">Uncertainty:</span>
              <span className="font-semibold text-foreground">
                {item.priorityFactors.uncertaintyBps} bps
              </span>
            </div>
            <div>
              <span className="text-foreground-muted block">Amount Impact:</span>
              <span className="font-semibold text-foreground">
                {item.priorityFactors.amountSignificanceBps} bps
              </span>
            </div>
            <div>
              <span className="text-foreground-muted block">Downstream:</span>
              <span className="font-semibold text-foreground">
                {item.priorityFactors.downstreamImpactBps} bps
              </span>
            </div>
            <div>
              <span className="text-foreground-muted block">Staleness:</span>
              <span className="font-semibold text-foreground">
                {item.priorityFactors.stalenessBps} bps
              </span>
            </div>
          </div>
          <p className="text-foreground-muted italic pt-1 border-t border-border/40">
            {item.priorityFactors.explanation}
          </p>
        </div>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
        <button
          type="button"
          onClick={() => setShowFactors((prev) => !prev)}
          className="text-2xs font-medium text-foreground-muted hover:text-accent transition-colors"
        >
          {showFactors ? "Hide priority factors ▲" : "Why was this prioritized? ▼"}
        </button>

        <div className="flex items-center gap-2">
          <Link
            href={getSourceHref()}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface-muted/40 px-2.5 py-1 text-2xs font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            View Source entity ↗
          </Link>

          {isActionable ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                disabled={isDismissing}
                className="h-7 px-2.5 text-2xs"
              >
                {isDismissing ? "Dismissing..." : "Dismiss"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsFeedbackOpen(true)}
                className="h-7 px-2.5 text-2xs"
              >
                Review & Feedback
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <ReviewFeedbackDialog
        item={item}
        isOpen={isFeedbackOpen}
        isSubmitting={isSubmittingFeedback}
        onClose={() => setIsFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </article>
  );
}

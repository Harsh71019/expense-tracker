"use client";

import type { ReviewItem, ReviewItemFeedbackAction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button, DialogSurface } from "@/components/ui";

interface ReviewFeedbackDialogProps {
  readonly item: ReviewItem | null;
  readonly isOpen: boolean;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (
    action: ReviewItemFeedbackAction,
    rating: number,
    notes?: string
  ) => Promise<void>;
}

export function ReviewFeedbackDialog({
  item,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit
}: ReviewFeedbackDialogProps): ReactNode {
  const [action, setAction] = useState<ReviewItemFeedbackAction>("accepted");
  const [rating, setRating] = useState<number>(5);
  const [notes, setNotes] = useState<string>("");

  if (!isOpen || !item) return null;

  async function handleSubmit(): Promise<void> {
    await onSubmit(action, rating, notes.trim() || undefined);
    onClose();
  }

  return (
    <DialogSurface
      labelledBy="review-feedback-title"
      describedBy="review-feedback-description"
      onClose={onClose}
      panelClassName="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
    >
      <div className="space-y-4">
        <div>
          <h2 id="review-feedback-title" className="text-base font-semibold text-foreground">
            Provide Review Feedback
          </h2>
          <p id="review-feedback-description" className="mt-0.5 text-xs text-foreground-muted">
            Help refine algorithmic recommendations for &quot;{item.title}&quot;.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Feedback Decision
          </label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAction("accepted")}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                action === "accepted"
                  ? "border-income/40 bg-income/10 text-income font-bold"
                  : "border-border bg-surface-muted/50 text-foreground-muted hover:text-foreground"
              }`}
            >
              ✓ Confirm Accuracy
            </button>
            <button
              type="button"
              onClick={() => setAction("modified")}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                action === "modified"
                  ? "border-accent/40 bg-accent-glow text-accent font-bold"
                  : "border-border bg-surface-muted/50 text-foreground-muted hover:text-foreground"
              }`}
            >
              ✎ Modified / Adjusted
            </button>
            <button
              type="button"
              onClick={() => setAction("rejected")}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                action === "rejected"
                  ? "border-expense/40 bg-expense/10 text-expense font-bold"
                  : "border-border bg-surface-muted/50 text-foreground-muted hover:text-foreground"
              }`}
            >
              ✕ Inaccurate
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="feedback-rating"
            className="text-xs font-semibold uppercase tracking-wider text-foreground-muted"
          >
            Detection Accuracy Rating (1–5)
          </label>
          <div className="mt-1.5 flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={`h-9 w-9 rounded-lg border text-sm font-bold transition-colors ${
                  rating >= star
                    ? "border-accent/50 bg-accent-glow text-accent"
                    : "border-border bg-surface-muted/50 text-foreground-muted"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="feedback-notes"
            className="text-xs font-semibold uppercase tracking-wider text-foreground-muted"
          >
            Optional Feedback Notes (No sensitive info)
          </label>
          <textarea
            id="feedback-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Expected higher sensitivity for variable amounts"
            className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-foreground-muted/60 focus:border-accent focus:outline-none"
            maxLength={200}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </div>
    </DialogSurface>
  );
}

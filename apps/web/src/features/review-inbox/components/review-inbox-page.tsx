"use client";

import type {
  ReviewInboxPage as ReviewInboxPageData,
  ReviewInboxSummary,
  ReviewItem,
  ReviewItemDismissReason,
  ReviewItemFeedbackAction
} from "@treasury-ops/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button, PageHeader, StatCard } from "@/components/ui";
import { apiClient } from "@/lib/api/client";

import type { ReviewInboxFilters } from "../model/filters";
import { ReviewInboxEmpty } from "./review-inbox-empty";
import { ReviewItemCard } from "./review-item-card";

interface ReviewInboxPageProps {
  readonly initialPage: ReviewInboxPageData;
  readonly summary: ReviewInboxSummary | null;
  readonly filters: ReviewInboxFilters;
}

export function ReviewInboxPage({
  initialPage,
  summary,
  filters
}: ReviewInboxPageProps): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<readonly ReviewItem[]>(initialPage.items);
  const [isSyncing, setIsSyncing] = useState(false);

  function updateQuery(params: Partial<Record<string, string>>): void {
    const nextParams = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    }
    router.push(`/review?${nextParams.toString()}`);
  }

  async function handleSync(): Promise<void> {
    setIsSyncing(true);
    try {
      await apiClient.POST("/v1/review-inbox/sync");
      router.refresh();
    } catch {
      // Handled gracefully
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDismiss(itemId: string, reason: ReviewItemDismissReason): Promise<void> {
    const idempotencyKey = crypto.randomUUID();
    const res = await apiClient.POST("/v1/review-inbox/{id}/dismiss", {
      params: {
        path: { id: itemId },
        header: { "Idempotency-Key": idempotencyKey }
      },
      body: { reason }
    });
    if (res.data?.item) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      router.refresh();
    }
  }

  async function handleFeedback(
    itemId: string,
    action: ReviewItemFeedbackAction,
    rating: number,
    notes?: string
  ): Promise<void> {
    const idempotencyKey = crypto.randomUUID();
    const body =
      notes !== undefined
        ? { action, feedbackRating: rating, notes }
        : { action, feedbackRating: rating };
    const res = await apiClient.POST("/v1/review-inbox/{id}/feedback", {
      params: {
        path: { id: itemId },
        header: { "Idempotency-Key": idempotencyKey }
      },
      body
    });
    if (res.data?.item) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      router.refresh();
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          eyebrow="Review"
          title="Personal Review Inbox"
          description="Impact-and-uncertainty prioritized advisory reviews for categories, recurring changes, and spending shifts."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          {isSyncing ? "Syncing..." : "Sync review items ↻"}
        </Button>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard padding="sm">
            <p className="font-mono text-2xs uppercase tracking-wider text-foreground-muted">
              Active Items
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">
              {summary.activeCount}
            </p>
            <p className="mt-0.5 text-2xs text-foreground-muted">Unreviewed advisory prompts</p>
          </StatCard>
          <StatCard padding="sm">
            <p className="font-mono text-2xs uppercase tracking-wider text-foreground-muted">
              Highest Urgency
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">
              {summary.highestPriorityScore !== null
                ? `${summary.highestPriorityScore} bps`
                : "None"}
            </p>
            <p className="mt-0.5 text-2xs text-foreground-muted">Priority factor score</p>
          </StatCard>
          <StatCard padding="sm">
            <p className="font-mono text-2xs uppercase tracking-wider text-foreground-muted">
              Categories to Review
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">
              {summary.categorySuggestionCount}
            </p>
            <p className="mt-0.5 text-2xs text-foreground-muted">Uncertain category predictions</p>
          </StatCard>
          <StatCard padding="sm">
            <p className="font-mono text-2xs uppercase tracking-wider text-foreground-muted">
              Recurring & Changes
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">
              {summary.recurringStreamCount + summary.recurringChangeCount}
            </p>
            <p className="mt-0.5 text-2xs text-foreground-muted">Stream shifts & candidates</p>
          </StatCard>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        {/* Source Filter Tabs */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Review item sources"
        >
          {(
            [
              { key: "all", label: "All Items" },
              { key: "category", label: "Categories" },
              { key: "recurring", label: "Recurring Streams" },
              { key: "changes", label: "Spending Changes" }
            ] as const
          ).map((tab) => {
            const isActive = filters.filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => updateQuery({ filter: tab.key, cursor: undefined })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-accent-glow text-accent font-semibold border border-accent/40"
                    : "text-foreground-muted hover:text-foreground hover:bg-surface-muted/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 text-xs">
          {(["active", "dismissed", "resolved", "superseded"] as const).map((st) => {
            const isSelected = filters.status === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => updateQuery({ status: st, cursor: undefined })}
                className={`rounded-md px-2.5 py-1 capitalize transition-colors ${
                  isSelected
                    ? "bg-surface-muted text-foreground font-semibold border border-border"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {st}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <ReviewInboxEmpty status={filters.status} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ReviewItemCard
              key={item.id}
              item={item}
              onDismiss={handleDismiss}
              onFeedback={handleFeedback}
            />
          ))}

          {initialPage.nextCursor ? (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQuery({ cursor: initialPage.nextCursor ?? undefined })}
              >
                Load Next Page →
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

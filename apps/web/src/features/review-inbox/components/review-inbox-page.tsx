"use client";

import {
  ReviewInboxPageSchema,
  type ReviewInboxPage as ReviewInboxPageData,
  type ReviewInboxSummary,
  type ReviewItem,
  type ReviewItemDismissReason,
  type ReviewItemFeedbackAction
} from "@treasury-ops/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button, PageHeader, StatCard } from "@/components/ui";
import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { generateRequestId } from "@/lib/request-id";
import { toast } from "@/lib/toast";

import {
  REVIEW_INBOX_PAGE_LIMIT,
  toApiSourceType,
  type ReviewInboxFilters
} from "../model/filters";
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
  const filterKey = `${filters.filter}:${filters.status}`;
  const [items, setItems] = useState<readonly ReviewItem[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setItems(initialPage.items);
    setNextCursor(initialPage.nextCursor);
  }, [filterKey, initialPage]);

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
      const result = await apiClient.POST("/v1/review-inbox/sync");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      router.refresh();
      toast.success("Review inbox synced");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not sync review items. Try again.";
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDismiss(itemId: string, reason: ReviewItemDismissReason): Promise<void> {
    const idempotencyKey = generateRequestId();
    try {
      const result = await apiClient.POST("/v1/review-inbox/{id}/dismiss", {
        params: {
          path: { id: itemId },
          header: { "Idempotency-Key": idempotencyKey }
        },
        body: { reason }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      if (!result.data?.item) {
        toast.error("Could not dismiss this review item.");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not dismiss this review item.";
      toast.error(message);
    }
  }

  async function handleFeedback(
    itemId: string,
    action: ReviewItemFeedbackAction,
    rating: number,
    notes?: string
  ): Promise<void> {
    const idempotencyKey = generateRequestId();
    const body =
      notes !== undefined
        ? { action, feedbackRating: rating, notes }
        : { action, feedbackRating: rating };

    try {
      const result = await apiClient.POST("/v1/review-inbox/{id}/feedback", {
        params: {
          path: { id: itemId },
          header: { "Idempotency-Key": idempotencyKey }
        },
        body
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      if (!result.data?.item) {
        toast.error("Could not submit feedback for this review item.");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not submit feedback for this review item.";
      toast.error(message);
    }
  }

  async function handleLoadMore(): Promise<void> {
    if (!nextCursor) return;

    setIsLoadingMore(true);
    try {
      const sourceType = toApiSourceType(filters.filter);
      const query: {
        limit: number;
        status: typeof filters.status;
        cursor: string;
        sourceType?: NonNullable<typeof sourceType>;
      } = {
        limit: REVIEW_INBOX_PAGE_LIMIT,
        status: filters.status,
        cursor: nextCursor
      };
      if (sourceType !== undefined) {
        query.sourceType = sourceType;
      }

      const result = await apiClient.GET("/v1/review-inbox", { params: { query } });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ReviewInboxPageSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);

      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const appended = parsed.data.items.filter((item) => !existingIds.has(item.id));
        return [...prev, ...appended];
      });
      setNextCursor(parsed.data.nextCursor);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load more review items.";
      toast.error(message);
    } finally {
      setIsLoadingMore(false);
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
                    ? "border border-accent/40 bg-accent-glow font-semibold text-accent"
                    : "text-foreground-muted hover:bg-surface-muted/60 hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 text-xs">
          {(["active", "dismissed", "resolved", "superseded"] as const).map((status) => {
            const isSelected = filters.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => updateQuery({ status, cursor: undefined })}
                className={`rounded-md px-2.5 py-1 capitalize transition-colors ${
                  isSelected
                    ? "border border-border bg-surface-muted font-semibold text-foreground"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {status}
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

          {nextCursor ? (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? "Loading..." : "Load Next Page →"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

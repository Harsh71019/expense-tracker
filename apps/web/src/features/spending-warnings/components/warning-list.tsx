"use client";

import type { SpendingWarning, SpendingWarningAnalysisStatus } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import type { WarningFilterValue } from "../model/filters";
import { WarningCard } from "./warning-card";
import { WarningEmptyState } from "./warning-empty-state";

export function WarningList({
  items,
  filter,
  analysisStatus,
  hasNextPage,
  isFetchingNextPage,
  hasNextPageError,
  onLoadMore
}: Readonly<{
  items: readonly SpendingWarning[];
  filter: WarningFilterValue;
  analysisStatus: SpendingWarningAnalysisStatus;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  hasNextPageError: boolean;
  onLoadMore: () => void;
}>): ReactNode {
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");

  function handleDismissed(warningId: string, message: string): void {
    setDismissedIds((current) => new Set(current).add(warningId));
    setAnnouncement(message);
  }

  const visible = items.filter((item) => !dismissedIds.has(item.id));

  return (
    <div>
      {/* Only the result of an interactive dismiss action is announced here (plan §2) — page load, filtering, and background refresh never touch this region. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {visible.length === 0 ? (
        filter !== "all" ? (
          <WarningEmptyState variant="filtered" />
        ) : analysisStatus === "ready" || analysisStatus === "stale" ? (
          <WarningEmptyState variant="no-warnings" />
        ) : null
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((item) => (
            <li key={item.id}>
              <WarningCard warning={item} onDismissed={handleDismissed} />
            </li>
          ))}
        </ul>
      )}

      {hasNextPage ? (
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
      {hasNextPageError ? (
        <p className="mt-4 text-center text-sm text-expense">
          Could not load more spending patterns.
        </p>
      ) : null}
    </div>
  );
}

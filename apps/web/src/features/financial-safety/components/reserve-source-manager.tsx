"use client";

import {
  ReserveSourcePageSchema,
  type ReserveSource,
  type ReserveSourcePage,
  type ReserveSummary
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/lib/toast";

import { useReserveSources } from "../hooks/use-reserve-sources";
import { groupReserveSources } from "../model/reserve-presentation";
import { ReserveSourceFormSheet } from "./reserve-source-form-sheet";
import { ReserveSourceRow } from "./reserve-source-row";
import { ReserveSummaryCard } from "./reserve-summary-card";

export interface ReserveSourceManagerProps {
  readonly initialSources: ReserveSourcePage | null;
  readonly initialSummary: ReserveSummary | null;
}

const SECTIONS: readonly Readonly<{
  key: keyof ReturnType<typeof groupReserveSources>;
  title: string;
  description: string;
  emptyLabel: string;
}>[] = [
  {
    key: "instant",
    title: "Instant access",
    description: "Normally accessible the same day.",
    emptyLabel: "No sources classified as instant access yet."
  },
  {
    key: "tPlusOne",
    title: "T+1 access",
    description: "Normally accessible by the next business/settlement day.",
    emptyLabel: "No sources classified as T+1 access yet."
  },
  {
    key: "lockedOrExcluded",
    title: "Locked or excluded",
    description: "Tracked for context, but never counted toward eligible reserve.",
    emptyLabel: "Nothing is locked or excluded."
  },
  {
    key: "availableUnconfigured",
    title: "Available but not configured",
    description: "Existing accounts and assets you have not classified yet.",
    emptyLabel: "Every eligible account and asset has been classified."
  },
  {
    key: "unavailableStaleOrMissing",
    title: "Unavailable — stale or missing values",
    description: "Configured, but a fresh valuation is needed before this can count.",
    emptyLabel: "No stale or missing valuations."
  }
];

/**
 * Settings section: lets a user explicitly classify existing accounts and
 * assets as emergency reserves. Selecting a source only changes this
 * planning metadata; it never moves money, changes a balance or valuation,
 * or posts a ledger transaction. The Financial Runway Clock (a later
 * feature) will consume the aggregate this screen manages.
 */
export function ReserveSourceManager({
  initialSources,
  initialSummary
}: ReserveSourceManagerProps): ReactNode {
  const sourcesQuery = useReserveSources(initialSources);
  const [extraItems, setExtraItems] = useState<readonly ReserveSource[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialSources?.pageInfo.nextCursor ?? null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [editing, setEditing] = useState<ReserveSource | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const page = sourcesQuery.data;
  const allItems: readonly ReserveSource[] = page ? [...page.items, ...extraItems] : [];

  function announce(message: string): void {
    setAnnouncement(message);
    toast.success(message);
  }

  async function loadMore(): Promise<void> {
    if (cursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await apiClient.GET("/v1/financial-safety/reserve-sources", {
        params: { query: { cursor, limit: 50 } }
      });
      const parsed = ReserveSourcePageSchema.safeParse(result.data);
      if (parsed.success) {
        setExtraItems((current) => [...current, ...parsed.data.items]);
        setCursor(parsed.data.pageInfo.nextCursor);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (sourcesQuery.isPending && page === undefined) {
    return (
      <section aria-busy="true" className="space-y-3">
        <p className="text-sm text-foreground-muted">Loading your emergency reserve sources…</p>
      </section>
    );
  }

  if (sourcesQuery.error && !page) {
    return (
      <div className="rounded-2xl border border-expense/30 bg-expense/5 p-5">
        <p className="text-sm text-foreground-muted">
          We could not load your reserve sources just now. Nothing has been changed.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 text-xs"
          onClick={() => void sourcesQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!page) return null;

  const grouped = groupReserveSources(allItems);
  const asOf = new Date();

  return (
    <div className="space-y-8">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ReserveSummaryCard initialData={initialSummary} />

      {allItems.length === 0 ? (
        <EmptyState
          title="No accounts or assets available yet"
          description="Add a bank account, cash account, or asset first, then come back to classify it as an emergency reserve."
        />
      ) : (
        SECTIONS.map((section) => {
          const items = grouped[section.key];
          return (
            <section key={section.key} className="space-y-3">
              <SectionHeader title={section.title} description={section.description} />
              {items.length === 0 ? (
                <p className="text-xs text-foreground-muted">{section.emptyLabel}</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((source) => (
                    <ReserveSourceRow
                      key={`${source.sourceKind}:${source.sourceId}`}
                      source={source}
                      asOf={asOf}
                      onEdit={setEditing}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      {cursor !== null ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      {editing === null ? null : (
        <ReserveSourceFormSheet
          source={editing}
          allSources={allItems}
          onClose={() => setEditing(null)}
          onSaved={announce}
        />
      )}
    </div>
  );
}

"use client";

import type { SpendingWarningPage } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { useSpendingWarnings } from "../hooks/use-spending-warnings";
import { matchesWarningFilter, type SpendingWarningFilters } from "../model/filters";
import { AnalysisStatus } from "./analysis-status";
import { WarningFilters } from "./warning-filters";
import { WarningList } from "./warning-list";

export function SpendingWarningsPage({
  filters,
  initialPage
}: Readonly<{
  filters: SpendingWarningFilters;
  initialPage: SpendingWarningPage | null;
}>): ReactNode {
  const list = useSpendingWarnings(filters, initialPage);

  const pages = list.data?.pages ?? (initialPage === null ? [] : [initialPage]);
  const rawItems = pages.flatMap((page) => page.items);
  const items = rawItems.filter((item) => matchesWarningFilter(item.kind, filters.filter));
  const analysis = pages.at(-1)?.analysis;
  const hasLoadError = list.isError && list.data === undefined;

  return (
    <section className="w-full space-y-4.5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Spending patterns
        </h1>
        <p className="mt-0.5 text-xs text-foreground-muted">
          Statistical anomaly detection and repeated merchant frequency warnings.
        </p>
      </header>

      <div>
        <AnalysisStatus
          analysis={analysis}
          hasLoadError={hasLoadError}
          onRetry={() => void list.refetch()}
        />
      </div>

      <div>
        <WarningFilters filters={filters} />

        {hasLoadError ? null : (
          <WarningList
            items={items}
            filter={filters.filter}
            analysisStatus={analysis?.status ?? "unavailable"}
            hasNextPage={list.hasNextPage}
            isFetchingNextPage={list.isFetchingNextPage}
            hasNextPageError={list.isFetchNextPageError}
            onLoadMore={() => void list.fetchNextPage()}
          />
        )}
      </div>
    </section>
  );
}

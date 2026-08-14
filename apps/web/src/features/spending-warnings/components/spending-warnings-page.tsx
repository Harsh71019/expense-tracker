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
    <section className="w-full space-y-6">
      <header>
        <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Insights
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Spending patterns
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
          Comparisons are based on your recent posted expenses. They are not fraud alerts, budgets,
          or financial advice.
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

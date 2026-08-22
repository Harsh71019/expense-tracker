"use client";

import { formatMinor, type ReceivableEvent } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { useReceivableEvents } from "../hooks/use-receivable-events";
import {
  isIncreaseEvent,
  isLegacyEvent,
  receivableEventLabel
} from "../model/receivable-presentation";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

function EventRow({ event }: Readonly<{ event: ReceivableEvent }>): ReactNode {
  const increase = isIncreaseEvent(event.kind);
  const legacy = isLegacyEvent(event.kind);

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${
        event.isReversed
          ? "border-border/60 bg-surface-muted/40 opacity-70"
          : "border-border bg-surface-muted"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {receivableEventLabel(event.kind)}
          {legacy ? (
            <span className="ml-1.5 text-2xs text-foreground-muted">(imported)</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-2xs text-foreground-muted">
          {dateFormatter.format(event.occurredAt)}
          {event.isReversed ? " · Reversed" : ""}
          {event.reason === undefined ? "" : ` · ${event.reason}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`font-mono text-sm font-bold ${event.isReversed ? "text-foreground-muted line-through" : increase ? "text-income" : "text-expense"}`}
        >
          {increase ? "+" : "−"}
          {formatMinor(event.amountMinor)}
        </p>
        {event.transactionId === undefined ? null : (
          <Link
            href={`/transactions/${event.transactionId}`}
            className="text-2xs font-semibold text-accent hover:underline"
          >
            View transaction
          </Link>
        )}
      </div>
    </li>
  );
}

export function ReceivableEventList({
  receivableId
}: Readonly<{ receivableId: string }>): ReactNode {
  const events = useReceivableEvents(receivableId);
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];

  if (events.isLoading) {
    return <p className="text-sm text-foreground-muted">Loading history…</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        description="Events will appear here as this debt moves."
      />
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
      {events.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={events.isFetchingNextPage}
            onClick={() => void events.fetchNextPage()}
          >
            {events.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

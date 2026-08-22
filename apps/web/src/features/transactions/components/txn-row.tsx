"use client";

import type { Account, Category, Transaction, TransactionSource } from "@treasury-ops/shared";
import type { CSSProperties, ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { glyphFor, IconGlyph, lighten } from "@/features/categories";

import { PaymentRailBadge } from "./payment-rail-badge";

export const TXN_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[2.4fr_1fr_1fr_1.1fr] md:gap-4";

const SOURCE_LABEL: Record<TransactionSource, string> = {
  manual: "Manual",
  csv_import: "CSV",
  recurring: "Recurring",
  api: "API"
};

const ACCOUNT_TYPE_ICON: Record<string, string> = {
  bank: "🏦",
  credit_card: "💳",
  cash: "💵",
  wallet: "👛",
  investment: "📈"
};

function dotStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return { background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${color})` };
}

type TxnRowProps = Readonly<{
  transaction: Transaction;
  category: Category | undefined;
  account?: Account | undefined;
  density?: "comfortable" | "compact" | undefined;
  onOpen: (transaction: Transaction) => void;
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata"
});

export function TxnRow({
  transaction,
  category,
  account,
  density = "comfortable",
  onOpen
}: TxnRowProps): ReactNode {
  const isReversed = transaction.status === "reversed";
  const isReversal = transaction.status === "reversal";
  const isIncome = transaction.type === "income";
  const icon = category?.icon ?? (isIncome ? "↓" : "↑");
  const isCompact = density === "compact";

  return (
    <button
      type="button"
      onClick={() => onOpen(transaction)}
      aria-label={`${transaction.description}, ${category?.name ?? "Uncategorized"}, ${dateFormatter.format(transaction.occurredAt)}`}
      className={`${TXN_ROW_GRID} w-full text-left transition-colors duration-150 hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        isCompact ? "px-3.5 py-2 sm:px-4" : "px-4 py-3.5 sm:px-5"
      } ${isReversed ? "opacity-55" : ""}`}
    >
      {/* 1. Description, Meta, & Badges */}
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 md:col-auto md:row-auto">
        <span
          style={dotStyle(category?.color)}
          className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border/80 text-base shadow-2xs ${
            isCompact ? "h-8 w-8 text-xs" : "h-9.5 w-9.5"
          } ${category?.color === undefined ? "bg-surface-muted text-foreground" : "text-white"}`}
          aria-hidden="true"
        >
          <IconGlyph
            value={category === undefined ? icon : glyphFor(category)}
            size={isCompact ? 14 : 16}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span
              className={`truncate font-semibold text-foreground ${
                isCompact ? "text-[13px]" : "text-sm"
              } ${isReversed ? "line-through" : ""}`}
            >
              {transaction.description}
            </span>
            {transaction.counterpartyHandle !== null &&
            transaction.counterpartyHandle !== undefined &&
            transaction.counterpartyHandle !== "" ? (
              <span className="truncate text-xs text-foreground-muted font-normal">
                · {transaction.counterpartyHandle}
              </span>
            ) : null}
            {account !== undefined ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface-muted/60 px-1.5 py-0.5 text-2xs font-medium text-foreground-muted">
                <span aria-hidden="true">{ACCOUNT_TYPE_ICON[account.type] ?? "💳"}</span>
                <span className="truncate max-w-28">{account.name}</span>
              </span>
            ) : null}
            {transaction.source === "manual" ? null : (
              <span className="shrink-0 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                {SOURCE_LABEL[transaction.source]}
              </span>
            )}
            {transaction.assetFunding === undefined ? null : (
              <span className="shrink-0 rounded-md border border-income/30 bg-income/10 px-1.5 py-0.5 font-mono text-2xs font-bold tracking-wider text-income uppercase">
                Investment
              </span>
            )}
            <PaymentRailBadge rail={transaction.paymentRail} />
          </div>

          {!isCompact && (transaction.tags.length > 0 || isReversed || isReversal) ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {isReversed || isReversal ? (
                <span className="rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-2xs font-bold text-warning">
                  {isReversed ? "Reversed" : "Reversal entry"}
                </span>
              ) : null}
              {transaction.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border/70 bg-surface-muted/60 px-1.5 py-0.2 font-mono text-2xs font-medium text-foreground-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* 2. Category */}
      <div
        className={`col-start-1 row-start-2 truncate pl-[44px] text-xs font-medium md:col-auto md:row-auto md:pl-0 ${
          isCompact ? "md:text-xs" : "md:text-sm"
        } ${category === undefined ? "text-foreground-muted/50" : "text-foreground"}`}
      >
        {category !== undefined ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              style={dotStyle(category.color)}
              className="h-2 w-2 shrink-0 rounded-full"
              aria-hidden="true"
            />
            <span className="truncate">{category.name}</span>
          </span>
        ) : (
          "—"
        )}
      </div>

      {/* 3. Date & Time */}
      <div className="col-start-2 row-start-2 text-right font-mono text-2xs font-medium text-foreground-muted md:col-auto md:row-auto md:text-left md:text-[13px]">
        <div>{dateFormatter.format(transaction.occurredAt)}</div>
        {!isCompact ? (
          <div className="text-2xs text-foreground-muted/70 hidden sm:block">
            {timeFormatter.format(transaction.occurredAt)}
          </div>
        ) : null}
      </div>

      {/* 4. Amount */}
      <div className="col-start-2 row-start-1 justify-self-end text-right md:col-auto md:row-auto">
        <Money
          minor={transaction.amountMinor}
          variant={isReversed ? "neutral" : transaction.type}
          signed
          size={isCompact ? "sm" : "md"}
          className={isReversed ? "line-through opacity-70" : ""}
        />
      </div>
    </button>
  );
}

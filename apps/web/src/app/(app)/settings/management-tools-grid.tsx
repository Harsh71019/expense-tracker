"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type ManagementItem = Readonly<{
  href: string;
  label: string;
  description: string;
  icon: string;
}>;

type ManagementGroup = Readonly<{
  id: string;
  label: string;
  countTag: string;
  description: string;
  items: readonly ManagementItem[];
}>;

export function ManagementToolsGrid({
  groups
}: Readonly<{ groups: readonly ManagementGroup[] }>): ReactNode {
  const [searchQuery, setSearchQuery] = useState("");

  const q = searchQuery.toLowerCase().trim();

  const filteredGroups = groups
    .map((group) => {
      if (q === "") return group;
      const matchingItems = group.items.filter(
        (item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
      );
      return { ...group, items: matchingItems };
    })
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Standardized Glassmorphic Filter Bar */}
      <div
        className={`flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
          searchQuery.trim() !== ""
            ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
            : "border-border/80 bg-surface-elevated/90"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20">
          <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
            ⌕
          </span>
          <input
            value={searchQuery}
            name="toolSearch"
            autoComplete="off"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search 12 ledger management tools, rules & integrations…"
            aria-label="Search management tools"
            className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
          />
          {searchQuery !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search input"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-2xl border border-border/80 bg-surface-elevated/60 p-8 text-center">
          <p className="text-base font-bold text-foreground">No matching tools found</p>
          <p className="mt-1 text-xs text-foreground-muted">
            No ledger management tools matched &quot;{searchQuery}&quot;. Try searching for
            &quot;accounts&quot;, &quot;imports&quot;, or &quot;budgets&quot;.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-4 rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-semibold text-accent hover:border-accent/40"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {filteredGroups.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`settings-group-${group.id}`}
              className={`glass-card rounded-2xl p-5 shadow-sm transition-all duration-200 ${
                group.id === "ledger" ? "xl:col-span-2" : ""
              }`}
            >
              <header className="flex flex-col gap-1 pb-4 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <h3
                    id={`settings-group-${group.id}`}
                    className="text-lg font-bold tracking-tight text-foreground"
                  >
                    {group.label}
                  </h3>
                  <span className="font-mono text-[10px] font-bold text-accent uppercase bg-accent-glow/50 border border-accent/20 px-2.5 py-0.5 rounded-full">
                    {group.countTag}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-foreground-muted pretty-text">
                  {group.description}
                </p>
              </header>

              <div
                className={`mt-4 grid gap-3 ${
                  group.id === "ledger"
                    ? "sm:grid-cols-2 xl:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2"
                }`}
              >
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group relative flex min-h-18 items-center gap-3.5 rounded-xl border border-border/70 bg-surface-elevated/70 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-glow/20 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:hover:translate-y-0"
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-glow/60 font-mono text-lg font-bold text-accent transition-transform duration-200 group-hover:scale-110"
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold tracking-tight text-foreground group-hover:text-accent transition-colors">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-foreground-muted pretty-text">
                        {item.description}
                      </span>
                    </span>
                    <span
                      className="font-mono text-sm text-foreground-muted transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent motion-reduce:group-hover:translate-x-0"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

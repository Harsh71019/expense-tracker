"use client";

import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CreditCard,
  Download,
  FileSpreadsheet,
  KeyRound,
  Landmark,
  PieChart,
  Repeat,
  Search,
  Sparkles,
  Tag,
  Target,
  X
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";

export interface ManagementItem {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly iconName: string;
  readonly badge: string;
}

export interface ManagementGroup {
  readonly id: string;
  readonly label: string;
  readonly countTag: string;
  readonly description: string;
  readonly items: readonly ManagementItem[];
}

const iconMap: Record<
  string,
  ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
> = {
  Landmark,
  Tag,
  ArrowLeftRight,
  CreditCard,
  Building2,
  PieChart,
  Target,
  Repeat,
  Sparkles,
  FileSpreadsheet,
  Download,
  KeyRound
};

export function ManagementToolsGrid({
  groups
}: Readonly<{ groups: readonly ManagementGroup[] }>): ReactNode {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const totalTools = useMemo(() => groups.reduce((sum, g) => sum + g.items.length, 0), [groups]);

  const q = searchQuery.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    return groups
      .filter((group) => activeCategory === "all" || group.id === activeCategory)
      .map((group) => {
        if (q === "") return group;
        const matchingItems = group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.badge.toLowerCase().includes(q)
        );
        return { ...group, items: matchingItems };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, activeCategory, q]);

  return (
    <div className="space-y-6">
      {/* Top Metrics Summary Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setActiveCategory(activeCategory === group.id ? "all" : group.id)}
            className={`glass-card flex items-center justify-between rounded-xl p-3.5 text-left transition-all hover:border-accent/40 ${
              activeCategory === group.id ? "border-accent bg-accent-glow/40 shadow-xs" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="font-mono text-2xs font-bold uppercase tracking-wider text-foreground-muted">
                {group.label}
              </p>
              <p className="mt-0.5 text-xs text-foreground font-semibold truncate">
                {group.description}
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-accent bg-accent-glow/50 border border-accent/20 px-2 py-0.5 rounded-full shrink-0 ml-2">
              {group.items.length}
            </span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl p-3 shadow-xs">
        {/* Category Pills */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Category filters"
        >
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeCategory === "all"
                ? "bg-accent text-accent-foreground font-bold shadow-2xs"
                : "bg-surface-muted text-foreground-muted hover:text-foreground"
            }`}
          >
            All Modules ({totalTools})
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveCategory(group.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeCategory === group.id
                  ? "bg-accent text-accent-foreground font-bold shadow-2xs"
                  : "bg-surface-muted text-foreground-muted hover:text-foreground"
              }`}
            >
              {group.label} ({group.items.length})
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[16rem] flex-1 sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-foreground-muted">
            <Search className="h-4 w-4" aria-hidden={true} />
          </span>
          <input
            value={searchQuery}
            name="toolSearch"
            autoComplete="off"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter modules, rules & data…"
            aria-label="Search management tools"
            className="h-9 w-full rounded-xl border border-border bg-surface-elevated pl-9 pr-8 text-xs text-foreground placeholder:text-foreground-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          {searchQuery !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search input"
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-foreground-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden={true} />
            </button>
          )}
        </div>
      </div>

      {/* Grid of Groups */}
      {filteredGroups.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center shadow-xs">
          <p className="text-sm font-bold text-foreground">No matching modules found</p>
          <p className="mt-1 text-xs text-foreground-muted">
            No tools matched &quot;{searchQuery}&quot;. Try &quot;accounts&quot;,
            &quot;imports&quot;, or &quot;budgets&quot;.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("all");
              }}
              className="rounded-xl border border-border bg-surface-muted px-3.5 py-1.5 text-xs font-semibold text-accent hover:border-accent/40"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`settings-group-${group.id}`}
              className="glass-card rounded-2xl p-4 sm:p-5 shadow-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div>
                  <h3
                    id={`settings-group-${group.id}`}
                    className="text-xs font-bold tracking-wider text-foreground uppercase"
                  >
                    {group.label}
                  </h3>
                  <p className="text-2xs text-foreground-muted mt-0.5">{group.description}</p>
                </div>
                <span className="font-mono text-2xs font-bold text-accent uppercase bg-accent-glow/50 border border-accent/20 px-2.5 py-0.5 rounded-full">
                  {group.countTag}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const Icon = iconMap[item.iconName] ?? Landmark;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group relative flex min-h-16 flex-col justify-between rounded-xl border border-border/70 bg-surface-elevated/70 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-glow/15 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:hover:translate-y-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-glow text-accent ring-1 ring-accent/20 transition-transform duration-200 group-hover:scale-105"
                            aria-hidden="true"
                          >
                            <Icon className="h-4 w-4" aria-hidden={true} />
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-bold tracking-tight text-foreground group-hover:text-accent transition-colors">
                              {item.label}
                            </span>
                            <span className="mt-0.5 block text-2xs text-foreground-muted line-clamp-2">
                              {item.description}
                            </span>
                          </div>
                        </div>

                        <span
                          className="text-foreground-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:group-hover:translate-x-0 shrink-0"
                          aria-hidden="true"
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden={true} />
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 font-mono text-2xs">
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-foreground-muted font-semibold">
                          {item.badge}
                        </span>
                        <span className="text-foreground-muted group-hover:text-accent transition-colors">
                          Open →
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

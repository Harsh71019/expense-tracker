"use client";

import {
  ArrowRight,
  ChartPie,
  Eye,
  EyeOff,
  House,
  Landmark,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Tag,
  Target,
  Upload,
  Wallet
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { DialogSurface } from "@/components/ui/dialog";
import { usePrivacy } from "@/lib/privacy/privacy-context";

type CommandItem = {
  id: string;
  label: string;
  category: "Navigation" | "Actions" | "Preferences";
  icon: typeof House;
  shortcut?: string;
  perform: () => void;
};

export function CommandPalette({
  open,
  onClose,
  onOpenCreateTxn
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onOpenCreateTxn: () => void;
}>): ReactNode {
  const router = useRouter();
  const { privacyMode, togglePrivacyMode } = usePrivacy();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: "nav-home",
      label: "Go to Dashboard",
      category: "Navigation",
      icon: House,
      perform: () => router.push("/")
    },
    {
      id: "nav-transactions",
      label: "Go to Transactions",
      category: "Navigation",
      icon: ReceiptText,
      perform: () => router.push("/transactions")
    },
    {
      id: "nav-accounts",
      label: "Go to Accounts",
      category: "Navigation",
      icon: Landmark,
      perform: () => router.push("/accounts")
    },
    {
      id: "nav-insights",
      label: "Go to Insights",
      category: "Navigation",
      icon: Sparkles,
      perform: () => router.push("/insights")
    },
    {
      id: "nav-budgets",
      label: "Go to Budgets",
      category: "Navigation",
      icon: Wallet,
      perform: () => router.push("/budgets")
    },
    {
      id: "nav-goals",
      label: "Go to Goals",
      category: "Navigation",
      icon: Target,
      perform: () => router.push("/goals")
    },
    {
      id: "nav-reports",
      label: "Go to Reports",
      category: "Navigation",
      icon: ChartPie,
      perform: () => router.push("/reports")
    },
    {
      id: "nav-categories",
      label: "Go to Categories",
      category: "Navigation",
      icon: Tag,
      perform: () => router.push("/categories")
    },
    {
      id: "nav-imports",
      label: "Go to Imports",
      category: "Navigation",
      icon: Upload,
      perform: () => router.push("/imports")
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      category: "Navigation",
      icon: Settings,
      perform: () => router.push("/settings")
    },
    {
      id: "act-create-txn",
      label: "Post New Transaction",
      category: "Actions",
      icon: Plus,
      shortcut: "⌘N",
      perform: () => {
        onOpenCreateTxn();
      }
    },
    {
      id: "act-privacy-toggle",
      label: privacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode",
      category: "Preferences",
      icon: privacyMode ? EyeOff : Eye,
      shortcut: "⌘P",
      perform: () => togglePrivacyMode()
    }
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase().trim())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? Math.max(0, filteredCommands.length - 1) : prev - 1
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected !== undefined) {
        selected.perform();
        onClose();
      }
    }
  }

  if (!open) return null;

  return (
    <DialogSurface
      labelledBy="command-palette-title"
      onClose={onClose}
      panelClassName="sm:max-w-lg p-0 overflow-hidden"
    >
      <div className="flex flex-col">
        {/* Search Header Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Search size={18} className="shrink-0 text-foreground-muted" />
          <input
            ref={inputRef}
            id="command-palette-title"
            type="text"
            placeholder="Type a command or search page..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-foreground-muted/60 focus:outline-none"
          />
          <kbd className="rounded border border-border bg-surface-muted px-1.5 font-mono text-2xs text-foreground-muted">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-foreground-muted">
              No matching commands found.
            </p>
          ) : (
            filteredCommands.map((cmd, index) => {
              const Icon = cmd.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => {
                    cmd.perform();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-accent-glow text-accent font-semibold"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg ${
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      <Icon size={14} />
                    </span>
                    <span>{cmd.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {cmd.shortcut !== undefined && (
                      <kbd className="rounded border border-border/80 bg-surface-muted px-1.5 font-mono text-2xs text-foreground-muted">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    <ArrowRight
                      size={13}
                      className={`transition-transform ${isSelected ? "translate-x-0.5 opacity-100" : "opacity-0"}`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="flex items-center justify-between border-t border-border bg-surface-muted/40 px-4 py-2 text-2xs font-mono text-foreground-muted">
          <span>
            Use <kbd className="font-semibold">↑</kbd> <kbd className="font-semibold">↓</kbd> to
            navigate
          </span>
          <span>
            <kbd className="font-semibold">↵</kbd> to select
          </span>
        </div>
      </div>
    </DialogSurface>
  );
}

import { ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { getApiKeys } from "@/features/api-keys";

function keyCountLabel(count: number): string {
  if (count === 0) {
    return "No API keys yet";
  }
  return count === 1 ? "1 active key" : `${count} active keys`;
}

export async function DeveloperAccessSection(): Promise<ReactNode> {
  const apiKeys = await getApiKeys();
  const activeCount = apiKeys.filter((key) => key.enabled).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        Scoped, revocable tokens for scripts and automations.
      </p>
      <Link
        href="/settings/api-keys"
        className="glass-card flex items-center justify-between gap-4 rounded-2xl p-4 shadow-xs transition-colors hover:border-accent/40 sm:p-5"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-glow text-accent">
            <KeyRound className="h-5 w-5" aria-hidden={true} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Manage API keys</p>
            <p className="truncate text-xs text-foreground-muted">{keyCountLabel(activeCount)}</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden={true} />
      </Link>
    </div>
  );
}

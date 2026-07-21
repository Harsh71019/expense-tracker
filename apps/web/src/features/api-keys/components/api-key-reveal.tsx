"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ApiKeyReveal({
  apiKey,
  onDismiss
}: Readonly<{ apiKey: string; onDismiss: () => void }>): ReactNode {
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(apiKey);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-accent-glow/20 p-4.5 sm:p-5">
      <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-accent uppercase">
        New API key
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Copy this now — it won&apos;t be shown again.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{apiKey}</code>
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          Copy
        </Button>
      </div>
      <div className="mt-3.5 flex justify-end">
        <Button type="button" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

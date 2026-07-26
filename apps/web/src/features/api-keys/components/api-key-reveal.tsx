"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { MaskedValue } from "./masked-value";

export function ApiKeyReveal({
  apiKey,
  onDismiss
}: Readonly<{ apiKey: string; onDismiss: () => void }>): ReactNode {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy this key");
    }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-accent-glow/20 p-4.5 sm:p-5">
      <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-accent uppercase">
        New API key
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Copy this now — it won&apos;t be shown again. Hidden by default in case anyone&apos;s
        looking over your shoulder.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <MaskedValue value={apiKey} ariaLabel="new API key" className="flex-1" />
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

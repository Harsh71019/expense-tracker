"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { MaskedValue } from "./masked-value";

function fallbackCopyTextToClipboard(text: string): boolean {
  if (typeof document === "undefined") return false;

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    return copied;
  } catch {
    return false;
  }
}

export function ApiKeyReveal({
  apiKey,
  onDismiss
}: Readonly<{ apiKey: string; onDismiss: () => void }>): ReactNode {
  async function copy(): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(apiKey);
        toast.success("Copied to clipboard");
        return;
      } catch {
        // The Clipboard API can reject in non-secure contexts or when permission is denied.
      }
    }

    if (fallbackCopyTextToClipboard(apiKey)) {
      toast.success("Copied to clipboard");
    } else {
      toast.error("Could not copy this key");
    }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-accent-glow/20 p-4.5 sm:p-5">
      <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-accent uppercase">
        New API key
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Copy this now — it won&apos;t be shown again. Hidden by default in case anyone&apos;s
        looking over your shoulder.
      </p>
      <div className="mt-3 flex flex-col items-stretch gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <MaskedValue value={apiKey} ariaLabel="new API key" className="flex-1" />
        <Button
          type="button"
          className="w-full sm:w-auto"
          variant="secondary"
          onClick={() => void copy()}
        >
          Copy
        </Button>
      </div>
      <div className="mt-3.5 flex justify-end">
        <Button type="button" className="w-full sm:w-auto" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

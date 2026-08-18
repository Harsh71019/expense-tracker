"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";

export default function OnboardingError({
  reset
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>): ReactNode {
  return (
    <PageShell width="standard">
      <PageHeader
        eyebrow="Financial Copilot / Error"
        title="Financial Readiness Diagnostic"
        description="We couldn't load your financial readiness diagnostic."
      />

      <div className="rounded-xl border border-expense/30 bg-expense/10 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-expense" />
        <h3 className="mt-3 text-sm font-bold text-foreground">
          Failed to load readiness diagnostic
        </h3>
        <p className="mt-1 text-xs text-foreground-muted">
          An error occurred while evaluating your data prerequisites.
        </p>
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => reset()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

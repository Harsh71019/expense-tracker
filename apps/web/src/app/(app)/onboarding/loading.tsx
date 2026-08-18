import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading(): ReactNode {
  return (
    <PageShell width="standard">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/" }, { label: "Onboarding & Readiness" }]}
      />

      <PageHeader
        eyebrow="Financial Copilot / Setup"
        title="Financial Readiness Diagnostic"
        description="Track your data readiness, complete essential onboarding steps, and unlock advanced intelligence engines."
      />

      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-2 w-full" />
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>

        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

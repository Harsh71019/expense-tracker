import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { OnboardingWizard } from "@/features/financial-profile";
import { getFinancialDiagnostic } from "@/features/financial-profile/server/get-financial-diagnostic";

export const metadata: Metadata = {
  title: "Financial Readiness & Onboarding | TreasuryOps",
  description:
    "Server-authoritative onboarding diagnostic tracking your Financial Copilot setup and capability prerequisites."
};

export default async function OnboardingPage(): Promise<ReactNode> {
  const diagnostic = await getFinancialDiagnostic();

  return (
    <PageShell width="standard" className="animate-fade-in">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/" }, { label: "Onboarding & Readiness" }]}
      />

      <PageHeader
        eyebrow="Financial Copilot / Setup"
        title="Financial Readiness Diagnostic"
        description="Track your data readiness, complete essential onboarding steps, and unlock advanced intelligence engines."
      />

      <OnboardingWizard initialDiagnostic={diagnostic} />
    </PageShell>
  );
}

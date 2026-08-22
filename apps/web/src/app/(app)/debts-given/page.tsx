import type { ReactNode } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { ReceivableManager } from "@/features/receivables";
import {
  getReceivables,
  getReceivableSummary
} from "@/features/receivables/server/get-receivables";

export default async function DebtsGivenPage(): Promise<ReactNode> {
  const [initialActive, initialSummary] = await Promise.all([
    getReceivables({ status: "active", limit: 50 }),
    getReceivableSummary()
  ]);
  return (
    <PageShell width="wide">
      <ReceivableManager initialActive={initialActive} initialSummary={initialSummary} />
    </PageShell>
  );
}

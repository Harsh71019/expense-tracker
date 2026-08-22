import type { ReactNode } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { ReceivableManager } from "@/features/receivables";
import { getReceivables } from "@/features/receivables/server/get-receivables";

export default async function DebtsGivenPage(): Promise<ReactNode> {
  const initialActive = await getReceivables({ status: "active", limit: 50 });
  return (
    <PageShell width="wide">
      <ReceivableManager initialActive={initialActive} />
    </PageShell>
  );
}

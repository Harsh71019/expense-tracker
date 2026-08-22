import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { ReceivableDetail } from "@/features/receivables";
import { getReceivable } from "@/features/receivables/server/get-receivables";

export default async function DebtsGivenDetailPage({
  params
}: Readonly<{ params: Promise<{ receivableId: string }> }>): Promise<ReactNode> {
  const { receivableId } = await params;
  const receivable = await getReceivable(receivableId);
  if (receivable === null) notFound();

  return (
    <PageShell width="standard">
      <ReceivableDetail initialReceivable={receivable} />
    </PageShell>
  );
}

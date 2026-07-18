import type { ImportBatchStatus } from "@vyaya/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

const statuses: Record<
  ImportBatchStatus,
  Readonly<{ label: string; variant: "pending" | "success" | "reversed" | "problem" }>
> = {
  pending: { label: "Pending", variant: "pending" },
  staged: { label: "Staged", variant: "pending" },
  committed: { label: "Committed", variant: "success" },
  reverted: { label: "Reverted", variant: "reversed" },
  failed: { label: "Failed", variant: "problem" }
};

export function ImportBatchStatus({ status }: Readonly<{ status: ImportBatchStatus }>): ReactNode {
  const item = statuses[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

import type { ImportBatchStatus } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

const statuses: Record<
  ImportBatchStatus,
  Readonly<{ label: string; variant: "pending" | "success" | "reversed" | "problem" }>
> = {
  pending: { label: "Pending", variant: "pending" },
  pending_parse: { label: "Parse queued", variant: "pending" },
  parsing: { label: "Parsing", variant: "pending" },
  staged: { label: "Staged", variant: "pending" },
  commit_queued: { label: "Commit queued", variant: "pending" },
  committing: { label: "Committing", variant: "pending" },
  committed: { label: "Committed", variant: "success" },
  revert_queued: { label: "Revert queued", variant: "pending" },
  reverting: { label: "Reverting", variant: "pending" },
  reverted: { label: "Reverted", variant: "reversed" },
  failed: { label: "Failed", variant: "problem" }
};

export function ImportBatchStatus({ status }: Readonly<{ status: ImportBatchStatus }>): ReactNode {
  const item = statuses[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

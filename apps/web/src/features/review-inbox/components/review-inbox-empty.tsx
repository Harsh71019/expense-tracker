import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui";

export function ReviewInboxEmpty({ status }: Readonly<{ status: string }>): ReactNode {
  const isFiltered = status !== "active";
  const title = isFiltered ? `No ${status} review items` : "Review inbox is all clear";
  const description = isFiltered
    ? `No items found in the ${status} tab.`
    : "You have reviewed all algorithmic suggestions, recurring changes, and spending alerts.";

  return (
    <div data-testid="review-inbox-empty" className="py-8">
      <EmptyState title={title} description={description} icon="✓" />
    </div>
  );
}

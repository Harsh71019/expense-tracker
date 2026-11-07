import { formatMinor, type CategoryRollupNode } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { rollupRowsBeneath } from "../model/rollup-rows";

const INDENT_PER_LEVEL_REM = 0.875;

type CategoryRollupRowsProps = Readonly<{
  root: CategoryRollupNode;
  descendants: readonly CategoryRollupNode[];
}>;

/** A parent's breakdown. These amounts are already inside the parent's total. */
export function CategoryRollupRows({ root, descendants }: CategoryRollupRowsProps): ReactNode {
  const rows = rollupRowsBeneath(root, descendants);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1" aria-label={`${root.name} breakdown`}>
      {rows.map((row) => (
        <li
          key={row.key}
          style={{ paddingLeft: `${row.depth * INDENT_PER_LEVEL_REM}rem` }}
          className="flex items-center gap-2 text-xs text-foreground-muted"
        >
          <span className={`min-w-0 truncate ${row.isDirect ? "italic" : ""}`}>{row.name}</span>
          {row.isArchived ? (
            <span className="shrink-0 rounded-[5px] bg-surface-muted px-1.5 py-0.5 font-mono text-2xs">
              archived
            </span>
          ) : null}
          <div className="flex-1" />
          <span className="shrink-0 font-mono">{formatMinor(row.amountMinor)}</span>
        </li>
      ))}
    </ul>
  );
}

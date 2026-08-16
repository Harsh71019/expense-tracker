import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The standing disclaimer for this section. It is not decoration: TreasuryOps
 * records protection facts, and the user needs to know it will not sell, rank,
 * or recommend a policy, and that nothing sensitive is being asked for.
 */
export function ProtectionDataNotice(): ReactNode {
  return (
    <section
      aria-labelledby="protection-notice-title"
      className="rounded-2xl border border-border bg-surface-muted/50 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-glow text-accent">
          <ShieldAlert className="h-4.5 w-4.5" aria-hidden={true} />
        </span>
        <div className="space-y-2">
          <h3 id="protection-notice-title" className="text-sm font-bold text-foreground">
            What this section does, and does not, do
          </h3>
          <ul className="space-y-1.5 text-xs leading-relaxed text-foreground-muted">
            <li>
              TreasuryOps records what cover you already have. It does not sell insurance, recommend
              a policy or insurer, or tell you how much cover to buy.
            </li>
            <li>
              Only amounts, dates, and statuses are stored. Never policy numbers, insurer logins,
              documents, or any medical detail — there is deliberately nowhere to type them.
            </li>
            <li>
              Insurance cover is recorded as a protection fact. It is never counted as an asset and
              never appears in your net worth.
            </li>
            <li>
              “Not sure” is a real answer. An unanswered question stays visible as unknown rather
              than being quietly treated as covered.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

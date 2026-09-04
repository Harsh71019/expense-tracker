"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { SafetyActionConfig } from "../model/safety-actions";

export interface SafetyNextActionProps {
  readonly action: SafetyActionConfig;
}

/**
 * The single next safety action, rendered as a link into the closed,
 * frontend-owned action-key route map -- never a URL taken from the API
 * response directly.
 */
export function SafetyNextAction({ action }: SafetyNextActionProps): ReactNode {
  return (
    <Link
      href={action.href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-glow px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span>{action.label}</span>
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

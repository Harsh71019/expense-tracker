import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_KEYS = new Set(["amountMinor", "description", "password", "key"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEYS.has(key)
      ? typeof entry === "number"
        ? "⟨minor⟩"
        : "⟨text⟩"
      : entry;
  }
  return redacted;
}

// Ledger contents (amounts, descriptions) never leave the app as GlitchTip
// payloads — only the shape/status of what happened, per LOGGING-FRONTEND.md §4.
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!isRecord(breadcrumb.data)) {
    return breadcrumb;
  }

  return { ...breadcrumb, data: redactRecord(breadcrumb.data) };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request === undefined || !isRecord(event.request.data)) {
    return event;
  }

  return {
    ...event,
    request: { ...event.request, data: redactRecord(event.request.data) }
  };
}

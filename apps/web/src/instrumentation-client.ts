import * as Sentry from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
  release: process.env.NEXT_PUBLIC_GIT_SHA,
  environment: process.env.NEXT_PUBLIC_ENV ?? "development",
  sampleRate: 1,
  tracesSampleRate: 0,
  maxBreadcrumbs: 50,
  beforeBreadcrumb: scrubBreadcrumb,
  beforeSend: scrubEvent,
  ignoreErrors: ["AbortError", "Load failed", /Failed to fetch/, "ResizeObserver loop"]
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

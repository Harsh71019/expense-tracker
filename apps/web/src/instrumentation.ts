import * as Sentry from "@sentry/nextjs";

import { isMockApiEnabled } from "./mocks/enabled";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (isMockApiEnabled) {
      const { startMockServer } = await import("./mocks/server");
      startMockServer();
    }

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
      release: process.env.NEXT_PUBLIC_GIT_SHA,
      environment: process.env.NEXT_PUBLIC_ENV ?? "development",
      tracesSampleRate: 0
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

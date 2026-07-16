import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
      release: process.env.NEXT_PUBLIC_GIT_SHA,
      environment: process.env.NEXT_PUBLIC_ENV ?? "development",
      tracesSampleRate: 0
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

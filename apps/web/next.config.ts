import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const apiBaseUrl = process.env.INTERNAL_API_URL ?? "http://localhost:4000/api";
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`
      }
    ];
  }
};

// Uploads source maps to GlitchTip during the image build when SENTRY_AUTH_TOKEN
// (+ org/project) are present in CI; a no-op locally without them.
const sentryBuildOptions: Parameters<typeof withSentryConfig>[1] = {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  ...(process.env.SENTRY_ORG === undefined ? {} : { org: process.env.SENTRY_ORG }),
  ...(process.env.SENTRY_PROJECT === undefined ? {} : { project: process.env.SENTRY_PROJECT })
};

export default withSentryConfig(nextConfig, sentryBuildOptions);

/**
 * Single toggle for the mock API layer. NEXT_PUBLIC_ so it's readable from
 * both the browser bundle (to start the MSW worker) and server contexts
 * (middleware, RSC, instrumentation) without needing a second flag.
 */
export const isMockApiEnabled = process.env.NEXT_PUBLIC_MOCK_API === "1";

export const MOCK_USER_ID = "mock000000000000000user";
export const MOCK_USER_EMAIL = "you@vyaya.mock";

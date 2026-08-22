export type ThrottleRequest = Readonly<{
  authUser?: Readonly<{ id: string }>;
  ip?: string;
}>;

/**
 * Authenticated callers share a per-user bucket so many devices behind one
 * nginx hop do not starve each other. Anonymous routes fall back to client IP
 * (requires `trust proxy` behind NPMplus).
 */
export function throttleTracker(request: ThrottleRequest): string {
  const userId = request.authUser?.id;
  if (typeof userId === "string" && userId.length > 0) {
    return `user:${userId}`;
  }
  const ip = request.ip;
  if (typeof ip === "string" && ip.length > 0) {
    return `ip:${ip}`;
  }
  return "ip:unknown";
}

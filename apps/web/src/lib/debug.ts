type Namespace = "api" | "query" | "offline" | "form";

const isDebugEnabled =
  process.env.NODE_ENV !== "production" ||
  (typeof window !== "undefined" && window.localStorage.getItem("treasury-ops:debug") === "1");

function createLogger(namespace: Namespace): (...args: unknown[]) => void {
  if (!isDebugEnabled) {
    return () => {};
  }

  return (...args: unknown[]) => {
    // eslint-disable-next-line no-console -- this is the sanctioned debug-logging path (LOGGING-FRONTEND.md §5)
    console.debug(`[${namespace}]`, ...args);
  };
}

export const debug: Record<Namespace, (...args: unknown[]) => void> = {
  api: createLogger("api"),
  query: createLogger("query"),
  offline: createLogger("offline"),
  form: createLogger("form")
};

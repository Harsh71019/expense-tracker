export class DeadlineExceededError extends Error {
  constructor(
    readonly operation: string,
    readonly timeoutMs: number
  ) {
    super(`${operation} exceeded its ${String(timeoutMs)}ms deadline.`);
    this.name = "DeadlineExceededError";
  }
}

export async function withDeadline<T>(
  operation: string,
  timeoutMs: number,
  task: Promise<T>
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(operation, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([task, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const QUEUE_RETENTION = {
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 }
} as const;

type AttemptedJob = Readonly<{
  attemptsMade: number;
  opts: Readonly<{ attempts?: number }>;
}>;

export function isTerminalJobFailure(job: AttemptedJob): boolean {
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { MongoMemoryReplSet } from "mongodb-memory-server";

const execFileAsync = promisify(execFile);

async function verifyMigrations(): Promise<void> {
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  try {
    const environment = {
      ...process.env,
      MONGODB_URI: `${replicaSet.getUri()}vyaya_migrations`
    };
    await execFileAsync("pnpm", ["--filter", "@vyaya/api", "migrate"], {
      cwd: process.cwd(),
      env: environment
    });
  } finally {
    await replicaSet.stop();
  }
}

void verifyMigrations();

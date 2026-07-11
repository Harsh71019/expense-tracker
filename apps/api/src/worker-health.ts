import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { RedisService } from "./common/redis/redis.service.js";

async function checkWorkerHealth(): Promise<void> {
  const config = new RuntimeConfigService();
  const redis = new RedisService(config);
  try {
    process.exitCode = (await redis.hasWorkerHeartbeat()) ? 0 : 1;
  } finally {
    await redis.onModuleDestroy();
  }
}

void checkWorkerHealth();

import type { RuntimeConfigService } from "../common/config/runtime-config.service.js";

export function createMockConfig(serviceRole: "api" | "worker" = "worker"): RuntimeConfigService {
  const mock = {
    env: {
      SERVICE_ROLE: serviceRole
    }
  };
  // @ts-expect-error mock config helper for unit tests
  return mock;
}

import { Module } from "@nestjs/common";

import { ApiKeysController } from "./api-keys.controller.js";
import { ApiKeysService } from "./api-keys.service.js";

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService]
})
export class ApiKeysModule {}

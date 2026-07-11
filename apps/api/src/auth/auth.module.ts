import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthGuard } from "./auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { UserProfilesModule } from "../user-profiles/user-profiles.module.js";

@Global()
@Module({
  imports: [UserProfilesModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, { provide: APP_GUARD, useExisting: AuthGuard }],
  exports: [AuthService, AuthGuard]
})
export class AuthModule {}

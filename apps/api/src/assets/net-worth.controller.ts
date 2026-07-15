import { Controller, Get } from "@nestjs/common";
import type { NetWorth } from "@vyaya/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { NetWorthService } from "./net-worth.service.js";

@Controller("v1/net-worth")
export class NetWorthController {
  constructor(private readonly netWorth: NetWorthService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<NetWorth> {
    return this.netWorth.get(user.id);
  }
}

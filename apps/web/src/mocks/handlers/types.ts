import type { OpenApiHttpHandlers } from "openapi-msw";

import type { paths } from "@/lib/api/generated/schema";

import type { MockStore } from "../data/store";

export type MockHttp = OpenApiHttpHandlers<paths>;
export type { MockStore };

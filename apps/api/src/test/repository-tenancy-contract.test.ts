import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const RESOURCE_REPOSITORIES = [
  new URL("../imports/import-batch.repository.ts", import.meta.url),
  new URL("../imports/staged-row.repository.ts", import.meta.url),
  new URL("../notifications/notification-outbox.repository.ts", import.meta.url)
] as const;

const PUBLIC_ASYNC_METHOD = /^\s{2}async\s+([A-Za-z0-9_]+)\s*\(\s*([^,\n)]*)/gm;

describe("repository tenancy contract", () => {
  for (const repositoryUrl of RESOURCE_REPOSITORIES) {
    it(`${repositoryUrl.pathname.split("/").at(-1) ?? repositoryUrl.pathname} scopes resource methods`, () => {
      const source = readFileSync(repositoryUrl, "utf8");
      const methods = [...source.matchAll(PUBLIC_ASYNC_METHOD)];

      expect(methods.length).toBeGreaterThan(0);
      for (const method of methods) {
        const methodName = method[1];
        const firstParameter = method[2];
        if (methodName?.startsWith("system") === true) continue;

        expect(firstParameter?.replaceAll(/\s/g, ""), methodName).toMatch(/^userId:string$/);
      }
    });
  }

  it("names the notification sweep as system discovery and returns tenant identity", () => {
    const source = readFileSync(RESOURCE_REPOSITORIES[2], "utf8");

    expect(source).toContain(
      "async systemFindPending(limit: number): Promise<NotificationOutboxEntry[]>"
    );
    expect(source).toMatch(/NotificationOutboxSchema = z\.object\(\{\s+id:[\s\S]*userId:/);
  });
});

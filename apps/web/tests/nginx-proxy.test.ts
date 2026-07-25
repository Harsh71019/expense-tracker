import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const nginxConfigPath = resolve(process.cwd(), "../../nginx.conf");

describe("Next.js reverse proxy", () => {
  it("preserves the browser host and port for Server Action origin checks", async () => {
    const config = await readFile(nginxConfigPath, "utf8");
    const webLocation = /location \/ \{(?<body>[\s\S]*?)\n\s{4}\}/.exec(config)?.groups?.body;

    expect(webLocation).toBeDefined();
    expect(webLocation).toContain("proxy_set_header Host       $http_host;");
    expect(webLocation).toContain("proxy_set_header X-Forwarded-Host $http_host;");
  });
});

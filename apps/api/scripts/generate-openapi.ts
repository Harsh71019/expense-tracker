import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { registry } from "../src/openapi/registry.js";

const output = fileURLToPath(new URL("../openapi.json", import.meta.url));
const generator = new OpenApiGeneratorV31(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.1.0",
  info: { title: "TreasuryOps API", version: "1.0.0" },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" }
    }
  }
});

await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);

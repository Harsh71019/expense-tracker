import { describe, expect, it } from "vitest";

import {
  isExpressMalformedJson,
  isExpressPayloadTooLarge,
  isMulterFileTooLarge
} from "../body-parser-errors.js";

describe("body parser error detection", () => {
  it("recognizes Express JSON parse failures", () => {
    const error = new SyntaxError("Unexpected token");
    Object.assign(error, { type: "entity.parse.failed", status: 400 });
    expect(isExpressMalformedJson(error)).toBe(true);
    expect(isExpressMalformedJson(new SyntaxError("plain"))).toBe(false);
  });

  it("recognizes Express payload-too-large failures", () => {
    const error = Object.assign(new Error("too large"), { type: "entity.too.large", status: 413 });
    expect(isExpressPayloadTooLarge(error)).toBe(true);
    expect(isExpressPayloadTooLarge(new Error("too large"))).toBe(false);
  });

  it("recognizes Multer file-size limit errors", () => {
    const error = Object.assign(new Error("File too large"), {
      name: "MulterError",
      code: "LIMIT_FILE_SIZE"
    });
    expect(isMulterFileTooLarge(error)).toBe(true);
    expect(isMulterFileTooLarge({ name: "MulterError", code: "LIMIT_UNEXPECTED_FILE" })).toBe(
      false
    );
  });
});

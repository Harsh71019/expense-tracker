import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import type { RuntimeEnv } from "../common/config/env.js";

const AES_256_GCM_ALGORITHM = "aes-256-gcm";
const AES_256_KEY_BYTES = 32;
const GCM_NONCE_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;

export type SealedPortfolioImportMaterial = Readonly<{
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
}>;

type EncryptionConfig = Readonly<{
  env: Pick<RuntimeEnv, "PORTFOLIO_IMPORT_ENCRYPTION_KEY" | "NODE_ENV">;
}>;

/**
 * Application-level sealing for short-lived CAS material. The plaintext PDF
 * password is deliberately never placed in BullMQ data, logs, or database
 * columns; only its independently sealed bytes may survive the request.
 */
@Injectable()
export class PortfolioImportEncryptionService {
  private readonly key: Buffer;

  constructor(@Inject(RuntimeConfigService) config: EncryptionConfig) {
    const encodedKey = config.env.PORTFOLIO_IMPORT_ENCRYPTION_KEY;
    if (encodedKey === undefined) {
      if (config.env.NODE_ENV === "test") {
        this.key = Buffer.alloc(AES_256_KEY_BYTES, 7);
        return;
      }
      throw new RangeError("Portfolio import encryption key is not configured.");
    }
    this.key = Buffer.from(encodedKey, "base64");
    if (this.key.byteLength !== AES_256_KEY_BYTES) {
      throw new RangeError("Portfolio import encryption key must be 32 bytes.");
    }
  }

  seal(plaintext: Uint8Array): SealedPortfolioImportMaterial {
    const nonce = randomBytes(GCM_NONCE_BYTES);
    const cipher = createCipheriv(AES_256_GCM_ALGORITHM, this.key, nonce, {
      authTagLength: GCM_AUTH_TAG_BYTES
    });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: 1 };
  }

  open(sealed: SealedPortfolioImportMaterial): Buffer {
    if (sealed.nonce.byteLength !== GCM_NONCE_BYTES) {
      throw new RangeError("Portfolio import nonce has an invalid length.");
    }
    if (sealed.authTag.byteLength !== GCM_AUTH_TAG_BYTES) {
      throw new RangeError("Portfolio import authentication tag has an invalid length.");
    }
    const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, this.key, sealed.nonce, {
      authTagLength: GCM_AUTH_TAG_BYTES
    });
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  }
}

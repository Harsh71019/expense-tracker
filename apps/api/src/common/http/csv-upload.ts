import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "@treasury-ops/shared";

/** Abort oversized CSV uploads at the parser, before buffering the whole body. */
export const csvUploadInterceptor = FileInterceptor("file", {
  limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES, files: 1 }
});

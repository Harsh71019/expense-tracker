import pino from "pino";
import type { DestinationStream, Level } from "pino";
import { createStream as createSeqStream } from "pino-seq";

export interface PinoDestinationConfig {
  logLevel: Level;
  logPretty: boolean;
  seqUrl?: string | undefined;
  seqApiKey?: string | undefined;
}

export function createPinoDestination(config: PinoDestinationConfig): DestinationStream {
  const primaryStream: DestinationStream = config.logPretty
    ? pino.transport({
        target: "pino-pretty",
        options: { colorize: true, singleLine: true, ignore: "pid,hostname" }
      })
    : process.stdout;

  if (!config.seqUrl) {
    return primaryStream;
  }

  const seqStream = createSeqStream(
    config.seqApiKey === undefined
      ? { serverUrl: config.seqUrl }
      : { serverUrl: config.seqUrl, apiKey: config.seqApiKey }
  );

  return pino.multistream([
    { stream: primaryStream, level: config.logLevel },
    { stream: seqStream, level: config.logLevel }
  ]);
}

import { describe, expect, it, vi } from "vitest";
import { MongoCommandLoggerService } from "../mongo-command-logger.service.js";

describe("MongoCommandLoggerService", () => {
  it("registers listener on module init and logs mongo commands", () => {
    let capturedHandler: (event: {
      commandName: string;
      databaseName: string;
      duration: number;
    }) => void = () => {};

    const mockClient = {
      on: vi.fn().mockImplementation((event, handler) => {
        if (event === "commandSucceeded") {
          capturedHandler = handler;
        }
      })
    };

    const mockConnection = {
      getClient: () => mockClient
    };

    const mockLogger = {
      warn: vi.fn(),
      debug: vi.fn()
    };

    const mockContext = {
      get: vi.fn().mockReturnValue({ reqId: "req-1" })
    };

    // @ts-expect-error - mock dependencies for unit testing
    const loggerService = new MongoCommandLoggerService(mockConnection, mockLogger, mockContext);
    loggerService.onModuleInit();

    expect(mockClient.on).toHaveBeenCalledWith("commandSucceeded", expect.any(Function));

    // Test standard command duration (< 100ms)
    capturedHandler({
      commandName: "find",
      databaseName: "vyaya",
      duration: 25
    });

    expect(mockLogger.debug).toHaveBeenCalledWith(
      {
        event: "mongo.command",
        command: "find",
        database: "vyaya",
        durationMs: 25,
        reqId: "req-1"
      },
      "MongoDB command completed"
    );

    // Test slow command duration (> 100ms)
    capturedHandler({
      commandName: "aggregate",
      databaseName: "vyaya",
      duration: 150
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        event: "mongo.slow",
        command: "aggregate",
        database: "vyaya",
        durationMs: 150,
        reqId: "req-1"
      },
      "slow MongoDB command"
    );
  });
});

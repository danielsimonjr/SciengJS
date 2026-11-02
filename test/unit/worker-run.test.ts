import { describe, expect, test } from "bun:test";
import { runInWorker } from "../../src/worker/run.ts";
import { RenderError } from "../../src/errors.ts";
import { TEST_REGISTRY } from "../support/test-registry.ts";

const moduleUrl = TEST_REGISTRY["dot:svg"]!.moduleUrl;

describe("runInWorker", () => {
  test("awaits the worker exit before it rejects on timeout", async () => {
    const exits: { exitCode: number }[] = [];
    let settledAfterExit = false;
    const promise = runInWorker(
      { moduleUrl, backend: "test/fixed", request: { type: "dot", format: "svg", source: "loop", options: {} } },
      {
        timeoutMs: 300,
        maxMemoryMb: 512,
        onWorkerExit: (info) => exits.push(info),
      },
    );
    try {
      await promise;
    } catch (err) {
      expect((err as RenderError).code).toBe("E_TIMEOUT");
      settledAfterExit = exits.length === 1;
    }
    expect(settledAfterExit).toBe(true);
    expect(exits[0]!.exitCode).not.toBe(0);
  });
});

import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { runInWorker } from "../../src/worker/run.ts";
import { RenderError } from "../../src/errors.ts";
import { TEST_REGISTRY } from "../support/test-registry.ts";
import { DEFAULT_ASSETS_URL } from "../../src/config.ts";

const moduleUrl = TEST_REGISTRY["dot:svg"]!.moduleUrl;
const SETTINGS = { maxMemoryMb: 512, rasterFont: undefined, assetsUrl: DEFAULT_ASSETS_URL, browser: undefined, timeoutMs: 60000 };
const OK_JOB = { moduleUrl, backend: "test/fixed", request: { type: "dot" as const, format: "svg" as const, source: "ok", options: {}, settings: SETTINGS } };
const FOREIGN_MODULE_URL = new URL("../support/stubs/stub-foreign-error.ts", import.meta.url).href;

/** A worker double. It answers with one ok message and lets the test choose how terminate behaves. */
function fakeWorkerWith(terminate: () => Promise<number>): () => Worker {
  return () => {
    const fake = new EventEmitter() as EventEmitter & { terminate: () => Promise<number> };
    fake.terminate = terminate;
    setTimeout(() => fake.emit("message", { ok: true, bytes: new Uint8Array([1]), warnings: [] }), 0);
    return fake as unknown as Worker;
  };
}

describe("runInWorker", () => {
  test("awaits the worker exit before it rejects on timeout", async () => {
    const exits: { exitCode: number }[] = [];
    let settledAfterExit = false;
    const promise = runInWorker(
      { moduleUrl, backend: "test/fixed", request: { type: "dot", format: "svg", source: "loop", options: {}, settings: SETTINGS } },
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

  test("rejects with E_INTERNAL when the exit callback throws, and does not leave an unhandled rejection", async () => {
    const result = await runInWorker(OK_JOB, {
      timeoutMs: 5000,
      maxMemoryMb: 512,
      onWorkerExit: () => {
        throw new Error("exit callback failed");
      },
    }).then(
      () => "resolved",
      (err: RenderError) => err.code,
    );
    expect(result).toBe("E_INTERNAL");
  });

  test("rejects with E_INTERNAL when terminate rejects", async () => {
    const result = await runInWorker(OK_JOB, {
      timeoutMs: 5000,
      maxMemoryMb: 512,
      createWorker: fakeWorkerWith(() => Promise.reject(new Error("terminate failed"))),
    }).then(
      () => "resolved",
      (err: RenderError) => err.code,
    );
    expect(result).toBe("E_INTERNAL");
  });

  test("a terminate that never resolves rejects with E_INTERNAL within the terminate wait", async () => {
    const started = Date.now();
    const result = await runInWorker(OK_JOB, {
      timeoutMs: 5000,
      maxMemoryMb: 512,
      terminateWaitMs: 100,
      createWorker: fakeWorkerWith(() => new Promise<number>(() => undefined)),
    }).then(
      () => "resolved",
      (err: RenderError) => err.code,
    );
    expect(result).toBe("E_INTERNAL");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("keeps the code of a RenderError that another copy of the error module made", async () => {
    const result = await runInWorker(
      { moduleUrl: FOREIGN_MODULE_URL, backend: "test/foreign", request: { type: "dot", format: "svg", source: "x", options: {}, settings: SETTINGS } },
      { timeoutMs: 5000, maxMemoryMb: 512 },
    ).then(
      () => "resolved",
      (err: RenderError) => `${err.code}: ${err.message}`,
    );
    expect(result).toBe("E_STAGE_MISSING: the foreign stage is missing");
  });
});

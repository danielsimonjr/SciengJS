import { describe, expect, test } from "bun:test";
import { constructWorker, workerExecArgv } from "../../src/worker/run.ts";
import type { Worker, WorkerOptions } from "node:worker_threads";

describe("workerExecArgv", () => {
  test("drops --input-type in both the = form and the two-token form", () => {
    expect(workerExecArgv(["--input-type=module"])).toEqual([]);
    expect(workerExecArgv(["--input-type", "module"])).toEqual([]);
  });

  test("drops -e and --eval with the code that follows them", () => {
    expect(workerExecArgv(["-e", "await render()"])).toEqual([]);
    expect(workerExecArgv(["--eval", "await render()"])).toEqual([]);
    expect(workerExecArgv(["--eval=await render()"])).toEqual([]);
  });

  test("drops -p and --print with the script that follows them", () => {
    expect(workerExecArgv(["-p", "1 + 1"])).toEqual([]);
    expect(workerExecArgv(["--print", "1 + 1"])).toEqual([]);
    expect(workerExecArgv(["--print=1 + 1"])).toEqual([]);
  });

  test("drops a combined short flag such as -pe with the code that follows it", () => {
    expect(workerExecArgv(["-pe", "1 + 1"])).toEqual([]);
    expect(workerExecArgv(["-ie", "1 + 1", "--no-warnings"])).toEqual(["--no-warnings"]);
    expect(workerExecArgv(["-ip", "1", "--no-warnings"])).toEqual(["--no-warnings"]);
  });

  test("drops the REPL and check flags, which change how the entry runs", () => {
    expect(workerExecArgv(["-i"])).toEqual([]);
    expect(workerExecArgv(["--interactive"])).toEqual([]);
    expect(workerExecArgv(["--check"])).toEqual([]);
    expect(workerExecArgv(["-c"])).toEqual([]);
  });

  test("keeps the flags that the worker needs to load the same modules", () => {
    const kept = ["--conditions=development", "--enable-source-maps", "--import", "./hook.mjs", "--stack-size=2000"];
    expect(workerExecArgv(kept)).toEqual(kept);
  });

  test("keeps the legitimate flags in order and drops only the loader flags", () => {
    const parent = ["--enable-source-maps", "--input-type=module", "--conditions=dev", "-e", "code", "--no-warnings"];
    expect(workerExecArgv(parent)).toEqual(["--enable-source-maps", "--conditions=dev", "--no-warnings"]);
  });

  test("returns an empty list for an empty parent list", () => {
    expect(workerExecArgv([])).toEqual([]);
  });

  test("does not mutate its input", () => {
    const parent = ["--input-type=module", "-e", "code"];
    workerExecArgv(parent);
    expect(parent).toEqual(["--input-type=module", "-e", "code"]);
  });
});

describe("constructWorker", () => {
  const base = { workerData: { id: 1 }, resourceLimits: { maxOldGenerationSizeMb: 64 } };
  const ENTRY = { worker: true } as unknown as Worker;

  /** A constructor double. It records each options object and throws the coded error for each listed call. */
  function recorder(failCodes: (string | undefined)[] = []) {
    const calls: WorkerOptions[] = [];
    const ctor = (options: WorkerOptions): Worker => {
      calls.push(options);
      const code = failCodes[calls.length - 1];
      if (code !== undefined) throw Object.assign(new Error("invalid"), { code });
      return ENTRY;
    };
    return { ctor, calls };
  }

  test("gives no execArgv key when the filter removes nothing, so Node inherits the parent flags", () => {
    const { ctor, calls } = recorder();
    expect(constructWorker(ctor, base, ["--conditions=development", "--enable-source-maps"])).toBe(ENTRY);
    expect(calls).toHaveLength(1);
    expect("execArgv" in calls[0]!).toBe(false);
    expect(calls[0]).toEqual(base);
  });

  test("passes the filtered list when the filter removes a flag", () => {
    const { ctor, calls } = recorder();
    constructWorker(ctor, base, ["--input-type=module", "--no-warnings"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.execArgv).toEqual(["--no-warnings"]);
  });

  test("constructs again with an empty list when the constructor throws ERR_WORKER_INVALID_EXEC_ARGV", () => {
    const { ctor, calls } = recorder(["ERR_WORKER_INVALID_EXEC_ARGV"]);
    expect(constructWorker(ctor, base, ["--input-type=module", "--stack-trace-limit=10"])).toBe(ENTRY);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.execArgv).toEqual(["--stack-trace-limit=10"]);
    expect(calls[1]!.execArgv).toEqual([]);
    expect(calls[1]!.workerData).toEqual(base.workerData);
  });

  test("also falls back when the implicit inheritance throws the coded error", () => {
    const { ctor, calls } = recorder(["ERR_WORKER_INVALID_EXEC_ARGV"]);
    constructWorker(ctor, base, ["--conditions=development"]);
    expect(calls).toHaveLength(2);
    expect("execArgv" in calls[0]!).toBe(false);
    expect(calls[1]!.execArgv).toEqual([]);
  });

  test("rethrows any other constructor error without a second attempt", () => {
    const { ctor, calls } = recorder(["ERR_SOMETHING_ELSE"]);
    expect(() => constructWorker(ctor, base, ["--input-type=module"])).toThrow("invalid");
    expect(calls).toHaveLength(1);
  });

  test("rethrows an error without a code, and a thrown non-object", () => {
    expect(() => constructWorker(() => { throw new Error("plain"); }, base, [])).toThrow("plain");
    expect(() => constructWorker(() => { throw null; }, base, [])).toThrow();
  });
});

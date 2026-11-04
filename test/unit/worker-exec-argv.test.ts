import { describe, expect, test } from "bun:test";
import { workerExecArgv } from "../../src/worker/run.ts";

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

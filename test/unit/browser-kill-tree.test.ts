// The process-tree kill of the browser stage. macOS refuses a group kill with EPERM when only zombies are left.
import { describe, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { killTree } from "../../src/browser/render.ts";

const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(`kill ${code}`), { code });
const child = (exited: boolean): ChildProcess => ({ pid: 4242, exitCode: exited ? 0 : null, signalCode: null }) as unknown as ChildProcess;
const posix = (code: string) => ({ windows: false, kill: () => { throw errno(code); } });

describe("killTree on POSIX", () => {
  test("it signals the process group of the browser", () => {
    const calls: [number, string][] = [];
    killTree(child(false), { windows: false, kill: (pid: number, sig: string) => { calls.push([pid, sig]); return true; } });
    expect(calls).toEqual([[-4242, "SIGKILL"]]);
  });

  test("a group that is already gone (ESRCH) is not an error", () => {
    expect(() => killTree(child(false), posix("ESRCH"))).not.toThrow();
  });

  test("EPERM after the browser exited is not an error: only zombies are left in the group", () => {
    expect(() => killTree(child(true), posix("EPERM"))).not.toThrow();
  });

  test("EPERM while the browser still runs is an error", () => {
    expect(() => killTree(child(false), posix("EPERM"))).toThrow("EPERM");
  });
});

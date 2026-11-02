import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { launchEvidence, removeProfile, waitForDevToolsPort } from "../support/page-checker.ts";

function errnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(`${code}: test`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

/** A remove function that throws the given codes in order, then succeeds. It counts its calls. */
function failingRemover(codes: string[]) {
  const calls = { count: 0 };
  const remove = (): void => {
    calls.count += 1;
    const code = codes.shift();
    if (code !== undefined) throw errnoError(code);
  };
  return { remove, calls };
}

describe("removeProfile retries a folder that is held", () => {
  for (const code of ["EBUSY", "EPERM", "ENOTEMPTY"]) {
    test(`retries ${code} and then succeeds`, async () => {
      const { remove, calls } = failingRemover([code]);
      await removeProfile("/unused", 5000, remove);
      expect(calls.count).toBe(2);
    });
  }

  test("throws a code that is not a hold at once", async () => {
    const { remove, calls } = failingRemover(["EACCES"]);
    let thrown = "";
    try {
      await removeProfile("/unused", 5000, remove);
    } catch (err) {
      thrown = (err as NodeJS.ErrnoException).code ?? "";
    }
    expect(thrown).toBe("EACCES");
    expect(calls.count).toBe(1);
  });
});

describe("waitForDevToolsPort names the last error when the deadline passes", () => {
  test("the timeout message holds the code of the last read error", async () => {
    const profile = mkdtempSync(join(tmpdir(), "sciengjs-page-check-io-"));
    try {
      // The file exists, so each poll reads it, and every read is held.
      writeFileSync(join(profile, "DevToolsActivePort"), "");
      const readText = (): string => {
        throw errnoError("EBUSY");
      };
      let message = "";
      try {
        await waitForDevToolsPort(profile, Date.now() + 300, readText);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain("did not publish its DevTools port");
      expect(message).toContain("EBUSY");
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });

  test("a port written after a held read is returned", async () => {
    const profile = mkdtempSync(join(tmpdir(), "sciengjs-page-check-io-"));
    try {
      writeFileSync(join(profile, "DevToolsActivePort"), "9222\n/devtools/browser/x\n");
      const port = await waitForDevToolsPort(profile, Date.now() + 2000, () => "9222\n/devtools/browser/x\n");
      expect(port).toBe(9222);
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });
});

describe("launchEvidence records why a launched process gave no port", () => {
  test("it holds the exit code and the stderr text of a process that died", async () => {
    const child = spawn(process.execPath, ["-e", "console.error('profile is locked'); process.exit(3)"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const evidence = launchEvidence(child);
    await new Promise((resolve) => child.once("close", resolve));
    const text = evidence.describe();
    expect(text).toContain("exit code 3");
    expect(text).toContain("profile is locked");
  });

  test("it keeps only the tail of a long stderr", async () => {
    const child = spawn(process.execPath, ["-e", "process.stderr.write('x'.repeat(20000) + 'END')"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const evidence = launchEvidence(child, 100);
    await new Promise((resolve) => child.once("close", resolve));
    const text = evidence.describe();
    expect(text).toContain("END");
    expect(text.length).toBeLessThan(400);
  });

  test("a process that still runs is reported as running", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { stdio: ["ignore", "ignore", "pipe"] });
    try {
      expect(launchEvidence(child).describe()).toContain("still running");
    } finally {
      child.kill();
    }
  });
});

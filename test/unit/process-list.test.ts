import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROFILE_PREFIX } from "../support/page-checker.ts";
import { holdsFolder, listCommandLines, processesHolding } from "../support/process-list.ts";

/** Starts a process whose command line holds the given folder, and waits until the listing sees it. */
async function startHolder(folder: string): Promise<{ stop: () => void }> {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)", folder], { stdio: "ignore" });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (listCommandLines().some((line) => line.includes(folder))) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { stop: () => child.kill("SIGKILL") };
}

describe("listCommandLines", () => {
  test("sees a running process whose command line holds the profile prefix", async () => {
    const token = `${PROFILE_PREFIX}control-probe`;
    const holder = await startHolder(token);
    try {
      expect(listCommandLines().some((line) => line.includes(token))).toBe(true);
    } finally {
      holder.stop();
    }
  }, 60000);
});

describe("processesHolding matches one profile folder, not the prefix", () => {
  test("a folder name is held only by a command line that names that folder", () => {
    const mine = join(tmpdir(), `${PROFILE_PREFIX}AAAAAA`);
    expect(holdsFolder(`chrome --user-data-dir=${mine}`, mine)).toBe(true);
    expect(holdsFolder(`chrome --user-data-dir=${join(tmpdir(), `${PROFILE_PREFIX}AAAAAA2`)}`, mine)).toBe(false);
    expect(holdsFolder(`chrome --user-data-dir=${join(tmpdir(), `${PROFILE_PREFIX}BBBBBB`)}`, mine)).toBe(false);
  });

  test("a live process with a different check folder is not reported for this folder", async () => {
    const other = join(tmpdir(), `${PROFILE_PREFIX}ZZZZZZ`);
    const mine = join(tmpdir(), `${PROFILE_PREFIX}YYYYYY`);
    const holder = await startHolder(other);
    try {
      // The old prefix match would flag this process. The folder match must not.
      expect(listCommandLines().some((line) => line.includes(PROFILE_PREFIX) && line.includes(other))).toBe(true);
      expect(processesHolding(mine)).toEqual([]);
      expect(processesHolding(other).length).toBeGreaterThan(0);
    } finally {
      holder.stop();
    }
  }, 60000);
});

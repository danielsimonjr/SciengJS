import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { PROFILE_PREFIX } from "../support/page-checker.ts";
import { listCommandLines } from "../support/process-list.ts";

describe("listCommandLines", () => {
  test("sees a running process whose command line holds the profile prefix", async () => {
    const token = `${PROFILE_PREFIX}control-probe`;
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)", token], { stdio: "ignore" });
    try {
      // The listing runs while the probe is alive. Poll briefly, because the process table fills in after spawn.
      let found = false;
      for (let attempt = 0; attempt < 20 && !found; attempt++) {
        found = listCommandLines().some((line) => line.includes(token));
        if (!found) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(found).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  }, 60000);
});

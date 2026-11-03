import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderError } from "../errors.ts";

/** The prefix of every profile folder that a render creates. A test looks for it to find leaks. */
export const PROFILE_PREFIX = "sciengjs-browser-";

/** The codes that Windows gives while the browser still holds a file of the profile. */
const HOLD_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);
const RETRY_MS = 250;

/** Creates a new empty profile folder in the temporary folder of the system. */
export function makeProfile(): string {
  return mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
}

/**
 * Removes the profile. A held file is retried until the deadline. Any other error, or a deadline with the
 * folder still held, rejects with E_INTERNAL, so that a leak is never reported as clean.
 */
export async function removeProfile(profile: string, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === undefined || !HOLD_CODES.has(code) || Date.now() >= deadline) {
        throw new RenderError("E_INTERNAL", `cannot remove the browser profile ${profile}: ${(err as Error).message}`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

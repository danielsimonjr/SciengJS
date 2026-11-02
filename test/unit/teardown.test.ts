import { describe, expect, test } from "bun:test";
import { teardownLaunch } from "../support/page-checker.ts";

describe("teardownLaunch", () => {
  test("runs close, then stop, then remove, in that order", async () => {
    const order: string[] = [];
    await teardownLaunch({
      close: async () => void order.push("close"),
      stop: async () => void order.push("stop"),
      remove: async () => void order.push("remove"),
    });
    expect(order).toEqual(["close", "stop", "remove"]);
  });

  test("still stops the launched process and removes the profile when close throws", async () => {
    const order: string[] = [];
    let message = "";
    try {
      await teardownLaunch({
        close: async () => {
          order.push("close");
          throw new Error("close failed");
        },
        stop: async () => void order.push("stop"),
        remove: async () => void order.push("remove"),
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(order).toEqual(["close", "stop", "remove"]);
    expect(message).toBe("close failed");
  });
});

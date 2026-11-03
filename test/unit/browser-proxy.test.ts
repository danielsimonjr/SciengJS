import { expect, test } from "bun:test";
import { request } from "node:http";
import { startRefusingProxy } from "../../src/browser/proxy.ts";

/** Sends one request through the proxy and resolves with the status it answers. */
function send(port: number, method: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("connect", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

test("the refusing proxy answers 403 to a plain request and records its host", async () => {
  const proxy = await startRefusingProxy();
  try {
    expect(await send(proxy.port, "GET", "http://example.invalid/page.png")).toBe(403);
    expect(proxy.attempts()).toEqual(["example.invalid"]);
  } finally {
    await proxy.close();
  }
});

test("the refusing proxy refuses a CONNECT tunnel and records its host", async () => {
  const proxy = await startRefusingProxy();
  try {
    expect(await send(proxy.port, "CONNECT", "example.invalid:443")).toBe(403);
    expect(proxy.attempts()).toEqual(["example.invalid"]);
  } finally {
    await proxy.close();
  }
});

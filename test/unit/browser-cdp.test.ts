import { describe, expect, test } from "bun:test";
import { CdpConnection, connectCdp, type CdpSocket } from "../../src/browser/cdp.ts";

/** A socket that records what it sends and lets a test deliver messages. */
class FakeSocket implements CdpSocket {
  sent: { id: number; method: string; params?: unknown; sessionId?: string }[] = [];
  closed = false;
  private listeners = new Map<string, Array<(ev: { data?: unknown }) => void>>();

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(): void {
    this.closed = true;
    this.deliver("close", {});
  }

  addEventListener(type: string, listener: (ev: { data?: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  deliver(type: string, ev: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(ev);
  }

  message(payload: unknown): void {
    this.deliver("message", { data: JSON.stringify(payload) });
  }
}

describe("CdpConnection", () => {
  test("resolves a request with the result of the reply that has its id", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const pending = cdp.send("Browser.getVersion", { a: 1 });
    expect(socket.sent[0]).toMatchObject({ id: 1, method: "Browser.getVersion", params: { a: 1 } });
    socket.message({ id: 1, result: { product: "Chrome/156" } });
    expect(await pending).toEqual({ product: "Chrome/156" });
  });

  test("rejects a request with the message of the protocol error", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const pending = cdp.send("Page.navigate", {});
    socket.message({ id: 1, error: { message: "Cannot navigate" } });
    await expect(pending).rejects.toThrow("Cannot navigate");
  });

  test("sends the session id of a request and matches a reply on that session", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const pending = cdp.send("Page.captureScreenshot", {}, "S1");
    expect(socket.sent[0]).toMatchObject({ sessionId: "S1" });
    socket.message({ id: 1, sessionId: "S1", result: { data: "AAAA" } });
    expect(await pending).toEqual({ data: "AAAA" });
  });

  test("passes an event only to the listener of its method and session", () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const seen: unknown[] = [];
    cdp.on("Fetch.requestPaused", "S1", (params) => seen.push(params));
    socket.message({ method: "Fetch.requestPaused", sessionId: "S2", params: { requestId: "x" } });
    socket.message({ method: "Fetch.requestPaused", sessionId: "S1", params: { requestId: "y" } });
    expect(seen).toEqual([{ requestId: "y" }]);
  });

  test("rejects every pending request when the socket closes", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const first = cdp.send("Browser.close");
    socket.close();
    await expect(first).rejects.toThrow(/closed/);
    await expect(cdp.send("Browser.getVersion")).rejects.toThrow(/closed/);
  });

  test("close closes the socket and rejects later requests", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    cdp.close();
    expect(socket.closed).toBe(true);
    await expect(cdp.send("Browser.getVersion")).rejects.toThrow(/closed/);
  });
});

describe("CdpConnection deadlines", () => {
  test("a request with no reply before the deadline rejects with E_TIMEOUT and drops its pending entry", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const pending = cdp.send("Page.navigate", {}, undefined, Date.now() + 30);
    await expect(pending).rejects.toMatchObject({ code: "E_TIMEOUT" });
    expect(cdp.pendingCount()).toBe(0);
    // A late reply is ignored.
    socket.message({ id: 1, result: {} });
    expect(cdp.pendingCount()).toBe(0);
  });

  test("the default deadline of the connection applies to each request", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    cdp.setDeadline(Date.now() + 30);
    await expect(cdp.send("Page.enable")).rejects.toMatchObject({ code: "E_TIMEOUT" });
    expect(cdp.pendingCount()).toBe(0);
  });

  test("a reply before the deadline resolves and clears the timer", async () => {
    const socket = new FakeSocket();
    const cdp = new CdpConnection(socket);
    const pending = cdp.send("Page.enable", {}, undefined, Date.now() + 5000);
    socket.message({ id: 1, result: { ok: true } });
    expect(await pending).toEqual({ ok: true });
    expect(cdp.pendingCount()).toBe(0);
  });
});

describe("connectCdp", () => {
  test("resolves with a connection on open", async () => {
    const socket = new FakeSocket();
    const opened = connectCdp("ws://x", Date.now() + 5000, () => socket);
    socket.deliver("open", {});
    expect(await opened).toBeInstanceOf(CdpConnection);
  });

  test("rejects with E_STAGE_MISSING when the socket closes before it opens", async () => {
    const socket = new FakeSocket();
    const opened = connectCdp("ws://x", Date.now() + 5000, () => socket);
    socket.deliver("close", {});
    await expect(opened).rejects.toMatchObject({ code: "E_STAGE_MISSING" });
  });

  test("rejects with E_STAGE_MISSING on an error event", async () => {
    const socket = new FakeSocket();
    const opened = connectCdp("ws://x", Date.now() + 5000, () => socket);
    socket.deliver("error", {});
    await expect(opened).rejects.toMatchObject({ code: "E_STAGE_MISSING" });
  });

  test("rejects with E_TIMEOUT and closes the socket when it does not open before the deadline", async () => {
    const socket = new FakeSocket();
    const opened = connectCdp("ws://x", Date.now() + 30, () => socket);
    await expect(opened).rejects.toMatchObject({ code: "E_TIMEOUT" });
    expect(socket.closed).toBe(true);
  });
});

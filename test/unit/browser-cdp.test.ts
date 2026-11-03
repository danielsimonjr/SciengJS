import { describe, expect, test } from "bun:test";
import { CdpConnection, type CdpSocket } from "../../src/browser/cdp.ts";

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

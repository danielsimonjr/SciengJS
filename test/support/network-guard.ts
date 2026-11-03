import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/** Puts back the connection functions that blockNetwork replaced. */
export type Restore = () => void;

/**
 * Replaces each way to open a connection with a recorder that throws. Each attempt adds a text to attempts.
 * The returned function puts the original functions back.
 */
export function blockNetwork(attempts: string[]): Restore {
  const saved = {
    fetch: globalThis.fetch,
    WebSocket: globalThis.WebSocket,
    connect: net.Socket.prototype.connect,
    lookup: dns.lookup,
    httpRequest: http.request,
    httpsRequest: https.request,
  };
  const refuse = (what: string) => {
    attempts.push(what);
    throw new Error("network is off");
  };
  globalThis.fetch = (async (input: unknown) => refuse(`fetch ${String(input)}`)) as unknown as typeof fetch;
  globalThis.WebSocket = class {
    constructor(url: string) {
      refuse(`WebSocket ${url}`);
    }
  } as unknown as typeof WebSocket;
  net.Socket.prototype.connect = (() => refuse("net.Socket.connect")) as unknown as typeof net.Socket.prototype.connect;
  dns.lookup = (() => refuse("dns.lookup")) as unknown as typeof dns.lookup;
  http.request = (() => refuse("http.request")) as unknown as typeof http.request;
  https.request = (() => refuse("https.request")) as unknown as typeof https.request;
  return () => {
    globalThis.fetch = saved.fetch;
    globalThis.WebSocket = saved.WebSocket;
    net.Socket.prototype.connect = saved.connect;
    dns.lookup = saved.lookup;
    http.request = saved.httpRequest;
    https.request = saved.httpsRequest;
  };
}

import { afterAll, describe, expect, test } from "bun:test";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { dotToSvg } from "../../src/graph/dot.ts";
import { svgToPng } from "../../src/raster/index.ts";
import { render } from "../../src/index.ts";
import { makeAssetsFolder, makeScratch, realFiles, removeScratch } from "../support/assets-fixture.ts";

const scratch = makeScratch("scieng-network-");
const ASSETS = makeAssetsFolder(scratch, "assets", realFiles());
afterAll(() => removeScratch(scratch));

const SOURCE = [
  "digraph G {",
  '  stylesheet="http://127.0.0.1:9/x.css";',
  '  a [image="http://127.0.0.1:9/img.png"];',
  '  b [URL="http://127.0.0.1:9/page"];',
  '  c [label=<<TABLE><TR><TD><IMG SRC="http://127.0.0.1:9/i.png"/></TD></TR></TABLE>>];',
  "}",
  "",
].join("\n");

/** The text of every href attribute and the name of the element that holds it. */
function hrefs(svg: string): { element: string; value: string }[] {
  const found: { element: string; value: string }[] = [];
  for (const match of svg.matchAll(/<([a-zA-Z][\w:-]*)\b[^>]*?\s(?:xlink:)?href="([^"]*)"/g)) {
    found.push({ element: match[1], value: match[2] });
  }
  return found;
}

type Restore = () => void;

/** Replaces each way to open a connection with a recorder that throws. */
function blockNetwork(attempts: string[]): Restore {
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

describe("graph stage with allowNetwork none", () => {
  test("the public render to svg holds no external reference and gives a warning for each removed one", async () => {
    const result = await render({ type: "dot", source: SOURCE, format: "svg" }, { allowNetwork: "none" });
    expect(result.mime).toBe("image/svg+xml");
    const svg = new TextDecoder().decode(result.bytes);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("xml-stylesheet");
    expect(svg).not.toContain("@import");
    expect(svg).not.toMatch(/url\(\s*["']?https?:/);
    expect(svg).not.toContain("img.png");
    expect(svg).not.toContain("x.css");
    expect(svg).not.toContain("i.png");
    // The one allowed href is the hyperlink of the URL attribute. A viewer follows it only on a click.
    const found = hrefs(svg);
    expect(found).toEqual([{ element: "a", value: "http://127.0.0.1:9/page" }]);
    expect(result.warnings.some((w) => w.includes("stylesheet"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("image"))).toBe(true);
  });

  test("the public render to png succeeds under allowNetwork none", async () => {
    const result = await render({ type: "dot", source: SOURCE, format: "png" }, { allowNetwork: "none", assetsUrl: ASSETS });
    expect(result.mime).toBe("image/png");
    expect(result.bytes.byteLength).toBeGreaterThan(100);
  });

  test("control: the recorder sees each kind of connection attempt", () => {
    const attempts: string[] = [];
    const restore = blockNetwork(attempts);
    try {
      expect(() => net.Socket.prototype.connect.call({} as net.Socket, "127.0.0.1:9" as never)).toThrow("network is off");
      expect(() => dns.lookup("example.invalid", () => undefined)).toThrow("network is off");
      expect(() => http.request("http://127.0.0.1:9/")).toThrow("network is off");
      expect(() => https.request("https://127.0.0.1:9/")).toThrow("network is off");
      expect(() => new WebSocket("ws://127.0.0.1:9/")).toThrow("network is off");
    } finally {
      restore();
    }
    expect(attempts).toEqual(["net.Socket.connect", "dns.lookup", "http.request", "https.request", "WebSocket ws://127.0.0.1:9/"]);
  });

  test("control: the recorder sees a fetch call", async () => {
    const attempts: string[] = [];
    const restore = blockNetwork(attempts);
    try {
      await expect(fetch("http://127.0.0.1:9/")).rejects.toThrow("network is off");
    } finally {
      restore();
    }
    expect(attempts).toEqual(["fetch http://127.0.0.1:9/"]);
  });

  test("the graph and raster code opens no connection: every way to connect records and refuses", async () => {
    const attempts: string[] = [];
    const restore = blockNetwork(attempts);
    try {
      const dot = await dotToSvg(SOURCE);
      expect(dot.svg).toContain("<svg");
      const png = await svgToPng(dot.svg, { scale: 1, maxMemoryMb: 2048, assetsUrl: ASSETS });
      expect(png.byteLength).toBeGreaterThan(100);
      expect(attempts).toEqual([]);
    } finally {
      restore();
    }
  });
});

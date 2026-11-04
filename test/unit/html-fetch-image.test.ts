import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createImageFetcher, isPrivateAddress, type LookupAll } from "../../src/html/fetch-image.ts";

type Route = (res: import("node:http").ServerResponse) => void;

const routes: Record<string, Route> = {};
let server: Server;
let port = 0;
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "");
    const route = routes[req.url ?? ""];
    if (route === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    route(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const png = (body: Uint8Array): Route => (res) => {
  res.setHeader("content-type", "image/png");
  res.end(body);
};
const redirect = (to: () => string): Route => (res) => {
  res.statusCode = 302;
  res.setHeader("location", to());
  res.end();
};

/** A resolver that sends every host name to the local server. */
const LOCAL: LookupAll = async () => [{ address: "127.0.0.1", family: 4 }];
const url = (path: string, host = "img.test") => `http://${host}:${port}${path}`;

/** A fetcher that may connect to the local server: loopback is allowed for the test only. */
function local(maxBytes = 1000, lookup: LookupAll = LOCAL, timeoutMs = 5000) {
  return createImageFetcher({ lookup, timeoutMs, maxBytes, allowLoopback: true });
}

describe("isPrivateAddress", () => {
  const blocked = [
    "127.0.0.1", "127.9.9.9", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "febf::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254",
  ];
  const allowed = ["8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.0.1", "2001:db8::1", "fec0::1"];
  for (const a of blocked) test(`${a} is private`, () => expect(isPrivateAddress(a)).toBe(true));
  for (const a of allowed) test(`${a} is public`, () => expect(isPrivateAddress(a)).toBe(false));
});

describe("createImageFetcher", () => {
  test("an image downloads from the address that the resolver gave", async () => {
    routes["/a.png"] = png(new Uint8Array([1, 2]));
    const got = await local()(url("/a.png"));
    expect(Array.from(got.bytes)).toEqual([1, 2]);
    expect(got.mime).toBe("image/png");
  });
  test("an upper-case HTTP scheme is accepted", async () => {
    routes["/u.png"] = png(new Uint8Array([1]));
    expect((await local()(url("/u.png").replace("http:", "HTTP:"))).mime).toBe("image/png");
  });
  test("loopback is refused by default, also through a host name", async () => {
    routes["/d.png"] = png(new Uint8Array([1]));
    const before = hits.length;
    const f = createImageFetcher({ lookup: LOCAL, timeoutMs: 5000, maxBytes: 1000 });
    await expect(f(url("/d.png"))).rejects.toThrow(/private/);
    await expect(f(url("/d.png", "127.0.0.1"))).rejects.toThrow(/private/);
    await expect(f(url("/d.png", "localhost"))).rejects.toThrow(/private/);
    await expect(f(url("/d.png", "[::1]"))).rejects.toThrow(/private/);
    expect(hits.length).toBe(before);
  });
  test("a host that resolves to a public address, then a private one, is refused at connect time", async () => {
    routes["/r.png"] = png(new Uint8Array([1]));
    let calls = 0;
    const rebinding: LookupAll = async () => {
      calls += 1;
      return [{ address: calls === 1 ? "93.184.215.14" : "169.254.169.254", family: 4 }];
    };
    const before = hits.length;
    await expect(local(1000, rebinding)("http://rebind.test/r.png")).rejects.toThrow(/169\.254\.169\.254/);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(hits.length).toBe(before);
  });
  test("one private address among public ones is refused", async () => {
    const mixed: LookupAll = async () => [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.1", family: 4 }];
    await expect(createImageFetcher({ lookup: mixed, timeoutMs: 5000, maxBytes: 10 })("http://x.test/a.png")).rejects.toThrow(/private/);
  });
  test("a redirect to 169.254.169.254 is refused", async () => {
    routes["/meta"] = redirect(() => "http://169.254.169.254/latest/meta-data");
    await expect(local()(url("/meta"))).rejects.toThrow(/private/);
  });
  test("three redirects are followed, a fourth is refused", async () => {
    for (let i = 0; i < 4; i += 1) routes[`/h${i}`] = redirect(() => url(`/h${i + 1}`));
    routes["/h4"] = png(new Uint8Array([1]));
    await expect(local()(url("/h0"))).rejects.toThrow(/redirect/);
    expect((await local()(url("/h1"))).mime).toBe("image/png");
  });
  test("a redirect to a scheme that is not http or https is refused", async () => {
    routes["/file"] = redirect(() => "file:///etc/passwd");
    await expect(local()(url("/file"))).rejects.toThrow(/http/);
  });
  test("a body over the size limit is refused while it streams", async () => {
    routes["/big"] = (res) => {
      res.setHeader("content-type", "image/png");
      res.write(new Uint8Array(8));
      res.end(new Uint8Array(8));
    };
    await expect(local(10)(url("/big"))).rejects.toThrow(/limit/);
  });
  test("a declared length over the size limit is refused", async () => {
    routes["/len"] = (res) => {
      res.setHeader("content-type", "image/png");
      res.setHeader("content-length", "99");
      res.end(new Uint8Array(99));
    };
    await expect(local(10)(url("/len"))).rejects.toThrow(/limit/);
  });
  test("a reply that is not an image is refused", async () => {
    routes["/html"] = (res) => {
      res.setHeader("content-type", "text/html");
      res.end("<p>");
    };
    await expect(local()(url("/html"))).rejects.toThrow(/image/);
  });
  test("an HTTP error status is refused", async () => {
    await expect(local()(url("/missing"))).rejects.toThrow(/404/);
  });
  test("file:, ftp: and //host are refused with no request", async () => {
    const before = hits.length;
    for (const u of ["file:///etc/passwd", "ftp://x.test/a.png", "//x.test/a.png"]) {
      await expect(local()(u)).rejects.toThrow();
    }
    expect(hits.length).toBe(before);
  });
  test("the time limit aborts a slow reply", async () => {
    routes["/slow"] = (res) => {
      res.setHeader("content-type", "image/png");
      res.write(new Uint8Array(1));
    };
    await expect(local(1000, LOCAL, 100)(url("/slow"))).rejects.toThrow();
  });
});

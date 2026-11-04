import { describe, expect, test } from "bun:test";
import { createImageFetcher, isPrivateAddress, type LookupAll } from "../../src/html/fetch-image.ts";

type Reply = { status?: number; headers?: Record<string, string>; body?: Uint8Array };

/** A fetch double: one reply per URL. It records each URL and each redirect mode. */
function fakeFetch(replies: Record<string, Reply>) {
  const calls: { url: string; redirect: string | undefined; hasSignal: boolean }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, redirect: init?.redirect, hasSignal: init?.signal instanceof AbortSignal });
    const r = replies[url];
    if (r === undefined) throw new Error(`no reply for ${url}`);
    return new Response(r.body ?? null, { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  return { fn: fn as typeof fetch, calls };
}

const PUBLIC: LookupAll = async () => [{ address: "93.184.215.14", family: 4 }];
const PNG = { "content-type": "image/png" };

function fetcher(fetchFn: typeof fetch, lookup: LookupAll = PUBLIC, maxBytes = 1000) {
  return createImageFetcher({ fetch: fetchFn, lookup, timeoutMs: 5000, maxBytes });
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
  test("a public image downloads with manual redirects and a time limit", async () => {
    const f = fakeFetch({ "https://x.test/a.png": { headers: PNG, body: new Uint8Array([1, 2]) } });
    const got = await fetcher(f.fn)("https://x.test/a.png");
    expect(Array.from(got.bytes)).toEqual([1, 2]);
    expect(got.mime).toBe("image/png");
    expect(f.calls).toEqual([{ url: "https://x.test/a.png", redirect: "manual", hasSignal: true }]);
  });
  test("an upper-case HTTP scheme is accepted", async () => {
    const f = fakeFetch({ "http://x.test/a.png": { headers: PNG, body: new Uint8Array([1]) } });
    expect((await fetcher(f.fn)("HTTP://x.test/a.png")).mime).toBe("image/png");
  });
  test("a redirect to 169.254.169.254 is refused", async () => {
    const f = fakeFetch({
      "https://x.test/a.png": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } },
    });
    const lookup: LookupAll = async (host) => [{ address: host === "x.test" ? "93.184.215.14" : host, family: 4 }];
    await expect(fetcher(f.fn, lookup)("https://x.test/a.png")).rejects.toThrow(/private/);
    expect(f.calls.map((c) => c.url)).toEqual(["https://x.test/a.png"]);
  });
  test("a host that resolves to a private address is refused before any request", async () => {
    const f = fakeFetch({});
    const lookup: LookupAll = async () => [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.1", family: 4 }];
    await expect(fetcher(f.fn, lookup)("https://x.test/a.png")).rejects.toThrow(/private/);
    expect(f.calls).toEqual([]);
  });
  test("localhost is refused", async () => {
    const f = fakeFetch({});
    await expect(fetcher(f.fn)("http://localhost/a.png")).rejects.toThrow(/private/);
    await expect(fetcher(f.fn)("http://[::1]/a.png")).rejects.toThrow(/private/);
    expect(f.calls).toEqual([]);
  });
  test("three redirects are followed, a fourth is refused", async () => {
    const hop = (n: number) => `https://x.test/${n}`;
    const replies: Record<string, Reply> = {};
    for (let i = 0; i < 4; i += 1) replies[hop(i)] = { status: 301, headers: { location: hop(i + 1) } };
    replies[hop(4)] = { headers: PNG, body: new Uint8Array([1]) };
    await expect(fetcher(fakeFetch(replies).fn)(hop(0))).rejects.toThrow(/redirect/);
    expect((await fetcher(fakeFetch(replies).fn)(hop(1))).mime).toBe("image/png");
  });
  test("a redirect to a scheme that is not http or https is refused", async () => {
    const f = fakeFetch({ "https://x.test/a": { status: 302, headers: { location: "file:///etc/passwd" } } });
    await expect(fetcher(f.fn)("https://x.test/a")).rejects.toThrow(/http/);
  });
  test("a body over the size limit is refused", async () => {
    const f = fakeFetch({ "https://x.test/a.png": { headers: PNG, body: new Uint8Array(11) } });
    await expect(fetcher(f.fn, PUBLIC, 10)("https://x.test/a.png")).rejects.toThrow(/limit/);
  });
  test("a declared length over the size limit is refused", async () => {
    const f = fakeFetch({ "https://x.test/a.png": { headers: { ...PNG, "content-length": "99" }, body: new Uint8Array(1) } });
    await expect(fetcher(f.fn, PUBLIC, 10)("https://x.test/a.png")).rejects.toThrow(/limit/);
  });
  test("a reply that is not an image is refused", async () => {
    const f = fakeFetch({ "https://x.test/a": { headers: { "content-type": "text/html" }, body: new Uint8Array(1) } });
    await expect(fetcher(f.fn)("https://x.test/a")).rejects.toThrow(/image/);
  });
  test("an HTTP error status is refused", async () => {
    const f = fakeFetch({ "https://x.test/a": { status: 404 } });
    await expect(fetcher(f.fn)("https://x.test/a")).rejects.toThrow(/404/);
  });
  test("file:, ftp: and //host are refused with no request", async () => {
    const f = fakeFetch({});
    for (const u of ["file:///etc/passwd", "ftp://x.test/a.png", "//x.test/a.png"]) {
      await expect(fetcher(f.fn)(u)).rejects.toThrow();
    }
    expect(f.calls).toEqual([]);
  });
  test("the time limit aborts a slow reply", async () => {
    const slow = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
    const f = createImageFetcher({ fetch: slow, lookup: PUBLIC, timeoutMs: 20, maxBytes: 10 });
    await expect(f("https://x.test/a.png")).rejects.toThrow();
  });
});

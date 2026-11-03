import { expect, test } from "bun:test";
import { forcedBrowserFlags } from "../../src/browser/flags.ts";

test("the forced flags route every connection through the refusing proxy and stop DNS", () => {
  const flags = forcedBrowserFlags({ profileDir: "C:/tmp/profile", proxyPort: 12345 });
  expect(flags).toContain("--proxy-server=http://127.0.0.1:12345");
  expect(flags).toContain("--proxy-bypass-list=<-loopback>");
  expect(flags).toContain("--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1");
  expect(flags).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
});

test("the flags start a headless browser on the given profile and never disable the sandbox", () => {
  const flags = forcedBrowserFlags({ profileDir: "C:/tmp/profile", proxyPort: 12345 });
  expect(flags).toContain("--headless=new");
  expect(flags).toContain("--user-data-dir=C:/tmp/profile");
  expect(flags).toContain("--remote-debugging-port=0");
  expect(flags.some((f) => f.includes("no-sandbox"))).toBe(false);
});

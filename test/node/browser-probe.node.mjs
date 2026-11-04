// Unit tests of the browser probes. They run under Node 22 with node:test, not under bun test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { externalSockets, noSandboxAmong, parseCim, parseLsof, parseNetTcp, parsePs, parseSs, rendererCount } from "./browser-probe.mjs";

const NO_SANDBOX = ["no", "sandbox"].join("-");

test("ss lines: a peer on a non-loopback address is external, a loopback peer is not", () => {
  const text = [
    "ESTAB 0 0 127.0.0.1:50000 127.0.0.1:8123 users:((\"chrome\",pid=900,fd=12))",
    "ESTAB 0 0 10.0.0.5:50001 142.250.80.46:443 users:((\"chrome\",pid=901,fd=13))",
    "ESTAB 0 0 [::1]:50002 [::1]:8124 users:((\"chrome\",pid=902,fd=14))",
  ].join("\n");
  const sockets = parseSs(text);
  assert.deepEqual(sockets.map((s) => [s.pid, s.host]), [[900, "127.0.0.1"], [901, "142.250.80.46"], [902, "::1"]]);
  assert.deepEqual(externalSockets(sockets).map((s) => s.pid), [901]);
});

test("lsof -F output: the remote end of each connection is read", () => {
  const text = "p123\nn10.0.0.2:5555->1.2.3.4:443\np124\nn127.0.0.1:6000->127.0.0.1:8125\np125\nn*:5353\n";
  const sockets = parseLsof(text);
  assert.deepEqual(sockets, [{ pid: 123, host: "1.2.3.4" }, { pid: 124, host: "127.0.0.1" }]);
  assert.deepEqual(externalSockets(sockets).map((s) => s.pid), [123]);
});

test("Get-NetTCPConnection JSON: a listener on 0.0.0.0 or :: is not external", () => {
  const json = JSON.stringify([
    { OwningProcess: 10, RemoteAddress: "0.0.0.0" },
    { OwningProcess: 11, RemoteAddress: "::" },
    { OwningProcess: 12, RemoteAddress: "127.0.0.1" },
    { OwningProcess: 13, RemoteAddress: "151.101.1.1" },
  ]);
  assert.deepEqual(externalSockets(parseNetTcp(json)).map((s) => s.pid), [13]);
  assert.deepEqual(parseNetTcp(""), []);
  assert.deepEqual(parseNetTcp(JSON.stringify({ OwningProcess: 7, RemoteAddress: "::1" })), [{ pid: 7, host: "::1" }]);
});

test("process lists: ps and CIM rows parse, and the sandbox flag and renderers are counted", () => {
  const procs = parsePs("  100 /usr/bin/chrome --user-data-dir=/tmp/p\n  101 /usr/bin/chrome --type=renderer --x\n");
  assert.deepEqual(procs.map((p) => p.pid), [100, 101]);
  assert.equal(rendererCount(procs), 1);
  assert.deepEqual(noSandboxAmong(procs), []);
  const cim = parseCim(JSON.stringify([{ ProcessId: 200, CommandLine: `chrome.exe --${NO_SANDBOX}` }, { ProcessId: 201, CommandLine: null }]));
  assert.deepEqual(cim.map((p) => p.pid), [200, 201]);
  assert.deepEqual(noSandboxAmong(cim).map((p) => p.pid), [200]);
});

// Trial T4: a minimal Chrome DevTools Protocol client. It starts the browser named by SCIENG_BROWSER
// with a new temporary profile, serves the test page and one pinned asset from this process, refuses
// every other request, renders a PNG and a PDF, and measures each step. It uses only node: modules and
// the WebSocket that Node 22 and Bun both provide. It has no npm dependency.
//
// Usage: SCIENG_BROWSER=<browser> bun measure.mjs --out <dir> [--runs N]
// Writes <dir>/<runtime>.jsonl (one record per render, then one summary line), first.png, first.pdf, big.png.
// Exit code 1 when any render failed. The records still name the failure.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = typeof Bun !== "undefined" ? "bun" : "node";
const RUNTIME_VERSION = typeof Bun !== "undefined" ? Bun.version : process.version;
const HOLD_READ = new Set(["EBUSY", "EPERM", "ENOENT"]);
const HOLD_REMOVE = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (x) => Math.round(x * 1000) / 1000;
const exited = (child) => child.exitCode !== null || child.signalCode !== null;

function parseArgs(argv) {
  const args = { out: undefined, runs: undefined, mode: "main" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--runs") args.runs = Number(argv[++i]);
    else if (argv[i] === "--mode") args.mode = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.out) throw new Error("--out <dir> is required");
  if (args.mode !== "main" && args.mode !== "negative") throw new Error(`unknown --mode ${args.mode}`);
  return args;
}

const REQUIRED_KEYS = ["pageUrl", "testPage", "chromeArgs", "forcedArgs", "profilePrefix", "runs", "viewport", "bigViewport", "huge", "boxCenter", "pinnedBoxColor", "pollMs", "timeouts", "sampler"];

function loadConfig() {
  const path = process.env.T4_CONFIG || join(HERE, "config.json");
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`cannot read the trial config ${path}: ${err.message}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in cfg)) throw new Error(`the trial config ${path} has no key "${key}"`);
  }
  return cfg;
}

function browserPath() {
  const path = process.env.SCIENG_BROWSER;
  if (!path) throw new Error("SCIENG_BROWSER is not set");
  if (!existsSync(path)) throw new Error(`SCIENG_BROWSER does not exist: ${path}`);
  return path;
}

function buildPage(cfg, noise) {
  let html = readFileSync(join(HERE, cfg.testPage.pageTemplate), "utf8");
  const values = {
    "{{UNLISTED_IMAGE}}": cfg.testPage.unlistedImage,
    "{{UNLISTED_SCRIPT}}": cfg.testPage.unlistedScript,
    "{{PINNED_URL}}": cfg.testPage.pinnedUrl,
    "{{NOISE}}": noise ? "true" : "false",
  };
  for (const [key, value] of Object.entries(values)) html = html.split(key).join(value);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error("the page template has a placeholder with no value");
  return html;
}

function dataUrl(html) {
  return `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
}

/** The host named by the first line of a proxied request: a CONNECT target or an absolute URL. */
function proxyHost(line) {
  if (line === null) return "(connection without data)";
  const connect = line.match(/^CONNECT\s+([^\s:]+)/);
  if (connect) return connect[1];
  const absolute = line.match(/^[A-Z]+\s+https?:\/\/([^/\s:]+)/);
  if (absolute) return absolute[1];
  return `(other) ${line.slice(0, 40)}`;
}

/**
 * A proxy that refuses every connection. It records each attempt (the first line of the request)
 * and answers 403 with no tunnel. It forwards nothing.
 */
async function startProxy(cfg) {
  const log = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    const entry = { line: null };
    log.push(entry);
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    const timer = setTimeout(() => socket.destroy(), cfg.timeouts.proxyWaitMs);
    socket.once("data", (chunk) => {
      clearTimeout(timer);
      entry.line = chunk.toString("latin1").split(/\r?\n/)[0].slice(0, 200);
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return {
    port: server.address().port,
    count: () => log.length,
    entries: (from) => log.slice(from).map((e) => e.line),
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

/** A small DevTools client over the built-in WebSocket. */
class Cdp {
  constructor(url, timeouts) {
    this.url = url;
    this.timeouts = timeouts;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = [];
    this.ws = undefined;
    this.stats = { frames: 0, binaryFrames: 0, maxBytes: 0, parseErrors: 0, closeCode: null };
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error(`WebSocket open timed out: ${this.url}`)), this.timeouts.socketOpenMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error on ${this.url}`));
      }, { once: true });
      ws.addEventListener("message", (ev) => this.onMessage(ev.data));
      ws.addEventListener("close", (ev) => {
        this.stats.closeCode = ev.code;
        const err = new Error(`DevTools socket closed with code ${ev.code}`);
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(err);
        }
        this.pending.clear();
      });
    });
  }

  onMessage(data) {
    let text;
    try {
      if (typeof data === "string") {
        text = data;
      } else {
        this.stats.binaryFrames++;
        text = Buffer.from(data).toString("utf8");
      }
    } catch {
      this.stats.parseErrors++;
      return;
    }
    this.stats.frames++;
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > this.stats.maxBytes) this.stats.maxBytes = bytes;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      this.stats.parseErrors++;
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result ?? {});
      return;
    }
    if (msg.method !== undefined) {
      for (const handler of this.handlers) handler(msg.method, msg.params ?? {}, msg.sessionId);
    }
  }

  on(handler) {
    this.handlers.push(handler);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, this.timeouts.commandMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  post(method, params = {}) {
    this.ws.send(JSON.stringify({ id: this.nextId++, method, params }));
  }

  closeSocket() {
    if (this.ws) this.ws.close();
  }
}

async function portAnswers(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function readPort(profile, deadline, pollMs, spawnFailure) {
  const file = join(profile, "DevToolsActivePort");
  let held = "none";
  while (Date.now() < deadline) {
    const failure = spawnFailure();
    if (failure) throw failure;
    if (existsSync(file)) {
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch (err) {
        if (!HOLD_READ.has(err.code)) throw err;
        held = err.code;
      }
      if (text !== undefined) {
        const [line1, line2] = text.split(/\r?\n/);
        const port = Number(line1);
        if (Number.isInteger(port) && port > 0 && line2) return port;
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`the browser did not publish DevToolsActivePort in time; last held read: ${held}`);
}

async function removeProfile(profile, deadlineMs, pollMs) {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch (err) {
      if (!HOLD_REMOVE.has(err.code) || Date.now() >= deadline) throw err;
      await sleep(pollMs * 5);
    }
  }
}

function waitExit(child, ms) {
  if (exited(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Asks the browser to close, waits for its port to stop, then reaps the process and removes the profile. */
async function stopBrowser(handle, cfg, rec) {
  const t = performance.now();
  const { timeouts, pollMs } = cfg;
  if (handle.cdp && handle.cdp.ws) {
    try {
      handle.cdp.post("Browser.close");
    } catch {
      // The wait below decides whether the browser stopped anyway.
    }
    handle.cdp.closeSocket();
  }
  let portStopped = true;
  if (handle.port !== undefined) {
    const deadline = Date.now() + timeouts.stopMs;
    while (Date.now() < deadline && (await portAnswers(handle.port))) await sleep(pollMs);
    portStopped = !(await portAnswers(handle.port));
  }
  if (handle.child) {
    if (!exited(handle.child)) {
      await waitExit(handle.child, timeouts.exitGraceMs);
      if (!exited(handle.child)) handle.child.kill();
      await waitExit(handle.child, timeouts.exitGraceMs);
    }
  }
  rec.stop = { stopMs: round(performance.now() - t), portStopped, childExited: handle.child ? exited(handle.child) : true };
  if (!portStopped) rec.error = rec.error ?? `the browser on port ${handle.port} did not stop`;
  if (handle.profile) {
    try {
      await removeProfile(handle.profile, timeouts.removeMs, pollMs);
      rec.profileRemoved = !existsSync(handle.profile);
    } catch (err) {
      rec.profileRemoved = false;
      rec.error = rec.error ?? `profile removal failed: ${err.message}`;
    }
  }
}

async function waitSettled(cdp, sessionId, cfg) {
  const deadline = Date.now() + cfg.timeouts.pageSettleMs;
  let last = null;
  while (Date.now() < deadline) {
    const r = await cdp.send("Runtime.evaluate", { expression: "JSON.stringify(window.__t4 ?? null)", returnByValue: true }, sessionId);
    const value = r.result && r.result.value;
    if (typeof value === "string" && value !== "null") {
      last = JSON.parse(value);
      if (last.settled) return last;
    }
    await sleep(cfg.pollMs);
  }
  throw new Error(`the page did not settle: ${JSON.stringify(last)}`);
}

/** Decodes an 8-bit non-interlaced RGB or RGBA PNG with node:zlib. */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("the screenshot is not a PNG");
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, interlace ${interlace}`);
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prior = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prior + x] : 0;
      const c = x >= bpp && y > 0 ? out[prior + x - bpp] : 0;
      let pred;
      switch (filter) {
        case 0: pred = 0; break;
        case 1: pred = a; break;
        case 2: pred = b; break;
        case 3: pred = (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      out[row + x] = (raw[src + x] + pred) & 0xff;
    }
  }
  return { width, height, bpp, pixels: out };
}

function pngStats(buf, box) {
  const img = decodePng(buf);
  const n = img.width * img.height;
  const colors = new Set();
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const o = i * img.bpp;
    const r = img.pixels[o];
    const g = img.pixels[o + 1];
    const b = img.pixels[o + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += luma;
    sumSq += luma * luma;
    if (colors.size < 100000) colors.add((r << 16) | (g << 8) | b);
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const o = (box.y * img.width + box.x) * img.bpp;
  const boxRgb = [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]];
  return {
    width: img.width,
    height: img.height,
    distinctColors: colors.size,
    distinctColorsCapped: colors.size >= 100000,
    lumaVariance: round(variance),
    boxRgb,
    notBlank: colors.size >= 3 && variance > 0,
  };
}

/** The arguments that force the browser through the refusing proxy. The negative control gets none. */
function forcedArgs(ctx, job) {
  if (job.negative) return [];
  return ctx.cfg.forcedArgs.map((a) => a.split("{proxyPort}").join(String(ctx.proxy.port)));
}

const PLATFORM = process.platform;

function commandFor(map, name) {
  const argv = map[PLATFORM];
  if (!argv) throw new Error(`the sampler has no ${name} command for ${PLATFORM}`);
  return argv;
}

/** Runs one command with a time limit and returns its standard output. */
function runCommand(argv, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${argv[0]} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && out === "") reject(new Error(`${argv[0]} exited ${code}: ${err.slice(0, 200)}`));
      else resolve(out);
    });
  });
}

/**
 * The process ids of the browser tree. Every process of one render carries its profile path in its command line,
 * so the profile path names the tree. A parent-process walk is not used: a Windows process id can be reused.
 */
function treeOf(processText, profile) {
  const tree = new Set();
  for (const line of processText.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (m && m[2].includes(profile)) tree.add(Number(m[1]));
  }
  return tree;
}

function hostAndPort(addr) {
  if (!addr || addr === "*" || addr === "*:*") return { host: "*", port: null };
  const i = addr.lastIndexOf(":");
  if (i < 0) return { host: addr, port: null };
  const port = Number(addr.slice(i + 1));
  return { host: addr.slice(0, i).replace(/^\[|\]$/g, ""), port: Number.isInteger(port) ? port : null };
}

function isLoopbackOrUnspecified(host) {
  return host === "localhost" || host.startsWith("127.") || host === "::1" || host === "*" || host === "0.0.0.0" || host === "::" || host === "";
}

/** The sockets of one socket table, one entry per owning process id. Each platform has its own layout. */
function parseSockets(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  if (PLATFORM === "linux") {
    // ss -H -tuna -p: netid state recv send local peer users:(("name",pid=N,fd=N))
    for (const line of lines) {
      const t = line.trim().split(/\s+/);
      if (t.length < 6) continue;
      for (const m of line.matchAll(/pid=(\d+)/g)) out.push({ proto: t[0].toLowerCase(), pid: Number(m[1]), local: t[4], peer: t[5] });
    }
  } else if (PLATFORM === "darwin") {
    // lsof -nP -iTCP -iUDP -FpnP: p = pid, P = protocol, n = name (local->peer)
    let pid = null;
    let proto = null;
    for (const line of lines) {
      const tag = line[0];
      const value = line.slice(1);
      if (tag === "p") pid = Number(value);
      else if (tag === "P") proto = value.toLowerCase();
      else if (tag === "n" && pid !== null) {
        const [, peer] = value.split("->");
        out.push({ proto, pid, local: value, peer: peer ?? null });
      }
    }
  } else if (PLATFORM === "win32") {
    // netstat -ano: proto local foreign [state] pid
    for (const line of lines) {
      const t = line.trim().split(/\s+/);
      if (t.length < 4 || (t[0] !== "TCP" && t[0] !== "UDP")) continue;
      const pid = Number(t[t.length - 1]);
      if (Number.isInteger(pid)) out.push({ proto: t[0].toLowerCase(), pid, local: t[1], peer: t[2] });
    }
  }
  return out;
}

/** One sample: the sockets that the browser process tree owns, and the ones that leave the host. */
async function sampleOnce(cfg, profile) {
  const timeout = cfg.sampler.commandTimeoutMs;
  const tree = treeOf(await runCommand(commandFor(cfg.sampler.processTable, "process table"), timeout), profile);
  const sockets = parseSockets(await runCommand(commandFor(cfg.sampler.sockets, "socket table"), timeout));
  const owned = sockets.filter((s) => tree.has(s.pid));
  const external = owned.filter((s) => s.peer !== null && !isLoopbackOrUnspecified(hostAndPort(s.peer).host));
  const dns = owned.filter((s) => s.proto === "udp" && hostAndPort(s.peer).port === 53);
  return {
    tree: tree.size,
    owned: owned.length,
    external: external.map((s) => `${s.proto} ${s.peer}`),
    dns: dns.map((s) => `${s.proto} ${s.peer}`),
  };
}

/** Samples the browser process tree from launch to stop. A failed sample is recorded, never ignored. */
function startSampler(cfg, profile) {
  const acc = { count: 0, errors: [], maxTree: 0, maxOwned: 0, external: new Set(), dns: new Set(), maxDns: 0 };
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        const s = await sampleOnce(cfg, profile);
        acc.count++;
        acc.maxTree = Math.max(acc.maxTree, s.tree);
        acc.maxOwned = Math.max(acc.maxOwned, s.owned);
        for (const e of s.external) acc.external.add(e);
        for (const e of s.dns) acc.dns.add(e);
        acc.maxDns = Math.max(acc.maxDns, s.dns.length);
      } catch (err) {
        acc.errors.push(err.message);
      }
      if (running) await sleep(cfg.sampler.intervalMs);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await loop;
      return {
        platform: PLATFORM,
        samples: acc.count,
        sampleErrors: acc.errors.length,
        firstSampleErrors: acc.errors.slice(0, 3),
        maxTreeProcesses: acc.maxTree,
        maxOwnedSockets: acc.maxOwned,
        externalEndpointCount: acc.external.size,
        externalEndpoints: [...acc.external].slice(0, 50),
        dnsUdp53Endpoints: [...acc.dns],
        maxDnsUdp53: acc.maxDns,
      };
    },
  };
}

/** One full render: a new profile, a launch, one page load, one capture, a stop and a removal. */
async function renderOnce(ctx, job) {
  const { cfg } = ctx;
  const handle = { child: undefined, profile: undefined, port: undefined, cdp: undefined };
  const net = { refused: [], fulfilled: [], responses: [], failed: [], sentUrls: new Set(), requestUrl: new Map(), errors: [] };
  const rec = {
    runtime: RUNTIME,
    runtimeVersion: RUNTIME_VERSION,
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    label: job.label,
    kind: job.kind,
    run: job.run,
    viewport: job.viewport,
    control: job.control,
    error: null,
  };
  const proxyFrom = ctx.proxy.count();
  let buf;
  let sampler;
  try {
    handle.profile = mkdtempSync(join(tmpdir(), cfg.profilePrefix));
    const t0 = performance.now();
    let spawnError;
    handle.child = spawn(
      ctx.browser,
      [...cfg.chromeArgs, ...forcedArgs(ctx, job), `--user-data-dir=${handle.profile}`, "about:blank"],
      { stdio: "ignore", windowsHide: true },
    );
    handle.child.on("error", (err) => {
      spawnError = err;
    });
    sampler = startSampler(cfg, handle.profile);
    handle.port = await readPort(handle.profile, Date.now() + cfg.timeouts.portMs, cfg.pollMs, () => spawnError);
    const version = await (await fetch(`http://127.0.0.1:${handle.port}/json/version`)).json();
    rec.browserVersion = version.Browser;
    const cdp = new Cdp(version.webSocketDebuggerUrl, cfg.timeouts);
    handle.cdp = cdp;
    await cdp.open();
    rec.startMs = round(performance.now() - t0);

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

    cdp.on((method, params, sid) => {
      if (sid !== sessionId) return;
      if (method === "Network.requestWillBeSent") {
        net.requestUrl.set(params.requestId, params.request.url);
        net.sentUrls.add(params.request.url);
      } else if (method === "Network.responseReceived") {
        const r = params.response || {};
        net.responses.push({ url: r.url, remoteIPAddress: r.remoteIPAddress || "", remotePort: r.remotePort ?? 0 });
      } else if (method === "Network.loadingFailed") {
        net.failed.push({ url: net.requestUrl.get(params.requestId), blockedReason: params.blockedReason ?? null, errorText: params.errorText });
      } else if (method === "Fetch.requestPaused") {
        const url = params.request.url;
        const id = params.requestId;
        if (url === cfg.pageUrl) {
          net.fulfilled.push(url);
          fulfil(cdp, sessionId, net, id, "text/html; charset=utf-8", Buffer.from(pageHtml, "utf8"));
        } else if (url === cfg.testPage.pinnedUrl) {
          net.fulfilled.push(url);
          fulfil(cdp, sessionId, net, id, "application/javascript; charset=utf-8", ctx.pinned);
        } else {
          net.refused.push({ url, resourceType: params.resourceType });
          cdp.send("Fetch.failRequest", { requestId: id, errorReason: "BlockedByClient" }, sessionId).catch((err) => net.errors.push(err.message));
        }
      }
    });

    const vp = job.viewport;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.scale, mobile: false }, sessionId);
    if (!job.control && !job.negative) {
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, sessionId);
    }

    const pageHtml = job.noise ? ctx.noiseHtml : ctx.html;
    const url = job.control || job.negative ? dataUrl(pageHtml) : cfg.pageUrl;
    const tNav = performance.now();
    const nav = await cdp.send("Page.navigate", { url }, sessionId);
    if (nav.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
    rec.pageState = await waitSettled(cdp, sessionId, cfg);
    rec.pageMs = round(performance.now() - tNav);

    if (job.kind === "pdf") {
      const t = performance.now();
      const r = await cdp.send("Page.printToPDF", { printBackground: true }, sessionId);
      rec.renderMs = round(performance.now() - t);
      buf = Buffer.from(r.data, "base64");
      const header = buf.subarray(0, 5).toString("latin1");
      rec.pdf = { header, ok: header === "%PDF-" };
    } else {
      const t = performance.now();
      const r = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
      rec.renderMs = round(performance.now() - t);
      buf = Buffer.from(r.data, "base64");
      rec.base64Chars = r.data.length;
      const box = { x: Math.round(cfg.boxCenter.x * vp.scale), y: Math.round(cfg.boxCenter.y * vp.scale) };
      rec.png = pngStats(buf, box);
      rec.png.boxIsPinnedColour = JSON.stringify(rec.png.boxRgb) === JSON.stringify(cfg.pinnedBoxColor);
    }
    rec.bytes = buf.length;
    rec.wsStats = { ...cdp.stats };
  } catch (err) {
    rec.error = err.message;
  } finally {
    if (sampler) rec.sampling = await sampler.stop();
    await stopBrowser(handle, cfg, rec);
  }
  rec.refused = net.refused;
  rec.refusedCount = net.refused.length;
  rec.fulfilled = net.fulfilled;
  rec.wireResponses = net.responses.filter((r) => r.remoteIPAddress !== "");
  rec.responses = net.responses;
  rec.loadingFailed = net.failed;
  rec.networkSentUrls = [...net.sentUrls];
  rec.proxyConnections = ctx.proxy.count() - proxyFrom;
  rec.proxyLines = ctx.proxy.entries(proxyFrom);
  rec.proxyHosts = rec.proxyLines.map(proxyHost);
  rec.negative = job.negative === true;
  rec.noise = job.noise === true;
  rec.netErrors = net.errors;
  return { rec, buf };
}

function fulfil(cdp, sessionId, net, requestId, contentType, body) {
  cdp
    .send(
      "Fetch.fulfillRequest",
      { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: contentType }], body: body.toString("base64") },
      sessionId,
    )
    .catch((err) => net.errors.push(err.message));
}

function median(values) {
  const xs = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

function countBy(items) {
  const out = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

function samplingSummary(records) {
  const withSampling = records.filter((r) => r.sampling && r.sampling.samples > 0);
  const external = new Set();
  const dns = new Set();
  for (const r of records) {
    if (!r.sampling) continue;
    for (const e of r.sampling.externalEndpoints) external.add(e);
    for (const e of r.sampling.dnsUdp53Endpoints) dns.add(e);
  }
  return {
    rendersSampled: records.filter((r) => r.sampling).length,
    rendersWithSamples: withSampling.length,
    samples: records.reduce((a, r) => a + (r.sampling?.samples ?? 0), 0),
    sampleErrors: records.reduce((a, r) => a + (r.sampling?.sampleErrors ?? 0), 0),
    firstSampleErrors: records.flatMap((r) => r.sampling?.firstSampleErrors ?? []).slice(0, 3),
    maxTreeProcesses: Math.max(0, ...records.map((r) => r.sampling?.maxTreeProcesses ?? 0)),
    maxOwnedSockets: Math.max(0, ...records.map((r) => r.sampling?.maxOwnedSockets ?? 0)),
    externalEndpointCount: external.size,
    externalEndpoints: [...external].slice(0, 50),
    maxDnsUdp53: Math.max(0, ...records.map((r) => r.sampling?.maxDnsUdp53 ?? 0)),
    dnsUdp53Endpoints: [...dns].slice(0, 20),
  };
}

function summarize(records) {
  const ok = records.filter((r) => r.label === "main" && !r.error);
  const main = records.filter((r) => r.label === "main");
  const summary = {
    type: "summary",
    runtime: RUNTIME,
    runtimeVersion: RUNTIME_VERSION,
    platform: platform(),
    arch: arch(),
    browserVersion: records.find((r) => r.browserVersion)?.browserVersion ?? null,
    failedRenders: records.filter((r) => r.error).length,
    kinds: {},
    proxyAttemptsPerRenderMain: [...new Set(main.map((r) => r.proxyConnections))],
    proxyHostsMain: countBy(main.flatMap((r) => r.proxyHosts)),
    pageResourceHostHitsMain: main.reduce((a, r) => a + r.proxyHosts.filter((h) => /python\.org|jquery|jsdelivr/.test(h)).length, 0),
    sampling: samplingSummary(main),
  };
  for (const kind of ["png", "pdf"]) {
    const rs = ok.filter((r) => r.kind === kind).sort((a, b) => a.run - b.run);
    const first = rs.find((r) => r.run === 0);
    const warm = rs.filter((r) => r.run > 0);
    summary.kinds[kind] = {
      renders: rs.length,
      first: first ? { startMs: first.startMs, renderMs: first.renderMs, bytes: first.bytes } : null,
      warmRuns: warm.length,
      warmMedian: {
        startMs: median(warm.map((r) => r.startMs)),
        renderMs: median(warm.map((r) => r.renderMs)),
        pageMs: median(warm.map((r) => r.pageMs)),
        bytes: median(warm.map((r) => r.bytes)),
      },
      refusedCounts: [...new Set(rs.map((r) => r.refusedCount))],
    };
  }
  const huge = records.find((r) => r.label === "huge");
  if (huge) {
    summary.huge = {
      error: huge.error,
      width: huge.png?.width ?? null,
      height: huge.png?.height ?? null,
      pngBytes: huge.bytes ?? null,
      base64Chars: huge.base64Chars ?? null,
      wsMaxBytes: huge.wsStats?.maxBytes ?? null,
      wsParseErrors: huge.wsStats?.parseErrors ?? null,
      wsCloseCode: huge.wsStats?.closeCode ?? null,
      notBlank: huge.png?.notBlank ?? null,
      boxIsPinnedColour: huge.png?.boxIsPinnedColour ?? null,
      arrivedWhole: Boolean(huge.bytes && huge.wsStats && huge.wsStats.parseErrors === 0 && huge.base64Chars > 10000000),
    };
  }
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  if (args.runs !== undefined) cfg.runs = args.runs;
  const browser = browserPath();
  const html = buildPage(cfg, false);
  const noiseHtml = buildPage(cfg, true);
  const pinned = readFileSync(join(HERE, cfg.testPage.pinnedFile));
  mkdirSync(args.out, { recursive: true });
  const jsonl = join(args.out, `${RUNTIME}.jsonl`);
  writeFileSync(jsonl, "");
  const proxy = await startProxy(cfg);
  const ctx = { cfg, html, noiseHtml, pinned, proxy, browser };
  const records = [];
  const emit = (rec) => {
    records.push(rec);
    const line = JSON.stringify(rec);
    appendFileSync(jsonl, line + "\n");
    console.log(line);
  };
  let summary;
  try {
    if (args.mode === "negative") {
      // No forced flags, no interception: the page's external hosts must fail for lack of a network.
      const neg = await renderOnce(ctx, { kind: "png", viewport: cfg.viewport, run: 0, label: "negative", control: false, negative: true });
      emit(neg.rec);
      const failedUrls = neg.rec.loadingFailed.map((f) => f.url);
      summary = {
        type: "summary",
        mode: "negative",
        runtime: RUNTIME,
        platform: platform(),
        imageFailed: failedUrls.includes(cfg.testPage.unlistedImage),
        scriptFailed: failedUrls.includes(cfg.testPage.unlistedScript),
        pinnedFailed: failedUrls.includes(cfg.testPage.pinnedUrl),
        loadingFailed: neg.rec.loadingFailed,
        renderError: neg.rec.error,
      };
    } else {
      for (let i = 0; i < cfg.runs; i++) {
        for (const kind of ["png", "pdf"]) {
          const { rec, buf } = await renderOnce(ctx, { kind, viewport: cfg.viewport, run: i, label: "main", control: false });
          emit(rec);
          if (i === 0 && buf) writeFileSync(join(args.out, kind === "png" ? "first.png" : "first.pdf"), buf);
        }
      }
      const big = await renderOnce(ctx, { kind: "png", viewport: cfg.bigViewport, run: 0, label: "big", control: false });
      emit(big.rec);
      if (big.buf) writeFileSync(join(args.out, "big.png"), big.buf);
      // Huge: a 4000 by 3000 device-pixel page of seeded noise, so that the screenshot message is over 10 MB.
      const huge = await renderOnce(ctx, { kind: "png", viewport: cfg.huge.viewport, run: 0, label: "huge", control: false, noise: true });
      emit(huge.rec);
      if (huge.buf) writeFileSync(join(args.out, "huge.png"), huge.buf);
      // Control: the same page with no interception. The external hosts must reach the proxy.
      const control = await renderOnce(ctx, { kind: "png", viewport: cfg.viewport, run: 0, label: "control", control: true });
      emit(control.rec);
      summary = summarize(records);
    }
  } finally {
    await proxy.close();
  }
  appendFileSync(jsonl, JSON.stringify(summary) + "\n");
  console.log(JSON.stringify(summary));
  process.exit(summary.failedRenders > 0 || summary.renderError ? 1 : 0);
}

main().catch((err) => {
  console.error(`measure failed: ${err.stack || err.message}`);
  process.exit(2);
});

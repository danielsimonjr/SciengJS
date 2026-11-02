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
  const args = { out: undefined, runs: undefined };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--runs") args.runs = Number(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.out) throw new Error("--out <dir> is required");
  return args;
}

const REQUIRED_KEYS = ["pageUrl", "testPage", "chromeArgs", "profilePrefix", "runs", "viewport", "bigViewport", "boxCenter", "pinnedBoxColor", "pollMs", "timeouts"];

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

function buildPage(cfg) {
  let html = readFileSync(join(HERE, cfg.testPage.pageTemplate), "utf8");
  const values = {
    "{{UNLISTED_IMAGE}}": cfg.testPage.unlistedImage,
    "{{UNLISTED_SCRIPT}}": cfg.testPage.unlistedScript,
    "{{PINNED_URL}}": cfg.testPage.pinnedUrl,
  };
  for (const [key, value] of Object.entries(values)) html = html.split(key).join(value);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error("the page template has a placeholder with no value");
  return html;
}

function dataUrl(html) {
  return `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
}

/** A proxy that counts every connection the browser opens to it. It forwards nothing. */
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
      socket.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return {
    port: server.address().port,
    count: () => log.length,
    entries: (from) => log.slice(from).map((e) => e.line ?? "(connection without data)"),
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
  try {
    handle.profile = mkdtempSync(join(tmpdir(), cfg.profilePrefix));
    const t0 = performance.now();
    let spawnError;
    handle.child = spawn(
      ctx.browser,
      [...cfg.chromeArgs, `--user-data-dir=${handle.profile}`, `--proxy-server=http://127.0.0.1:${ctx.proxy.port}`, "about:blank"],
      { stdio: "ignore", windowsHide: true },
    );
    handle.child.on("error", (err) => {
      spawnError = err;
    });
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
          fulfil(cdp, sessionId, net, id, "text/html; charset=utf-8", Buffer.from(ctx.html, "utf8"));
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
    if (!job.control) {
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, sessionId);
    }

    const url = job.control ? dataUrl(ctx.html) : cfg.pageUrl;
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
      const box = { x: Math.round(cfg.boxCenter.x * vp.scale), y: Math.round(cfg.boxCenter.y * vp.scale) };
      rec.png = pngStats(buf, box);
      rec.png.boxIsPinnedColour = JSON.stringify(rec.png.boxRgb) === JSON.stringify(cfg.pinnedBoxColor);
    }
    rec.bytes = buf.length;
    rec.wsStats = { ...cdp.stats };
  } catch (err) {
    rec.error = err.message;
  } finally {
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

function summarize(records) {
  const ok = records.filter((r) => r.label === "main" && !r.error);
  const summary = {
    type: "summary",
    runtime: RUNTIME,
    runtimeVersion: RUNTIME_VERSION,
    platform: platform(),
    arch: arch(),
    browserVersion: records.find((r) => r.browserVersion)?.browserVersion ?? null,
    failedRenders: records.filter((r) => r.error).length,
    kinds: {},
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
      proxyConnectionCounts: [...new Set(rs.map((r) => r.proxyConnections))],
    };
  }
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  if (args.runs !== undefined) cfg.runs = args.runs;
  const browser = browserPath();
  const html = buildPage(cfg);
  const pinned = readFileSync(join(HERE, cfg.testPage.pinnedFile));
  mkdirSync(args.out, { recursive: true });
  const jsonl = join(args.out, `${RUNTIME}.jsonl`);
  writeFileSync(jsonl, "");
  const proxy = await startProxy(cfg);
  const ctx = { cfg, html, pinned, proxy, browser };
  const records = [];
  const emit = (rec) => {
    records.push(rec);
    const line = JSON.stringify(rec);
    appendFileSync(jsonl, line + "\n");
    console.log(line);
  };
  try {
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
    // Control: the same page with no interception. The external hosts must reach the proxy.
    const control = await renderOnce(ctx, { kind: "png", viewport: cfg.viewport, run: 0, label: "control", control: true });
    emit(control.rec);
  } finally {
    await proxy.close();
  }
  const summary = summarize(records);
  appendFileSync(jsonl, JSON.stringify(summary) + "\n");
  console.log(JSON.stringify(summary));
  process.exit(summary.failedRenders > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`measure failed: ${err.stack || err.message}`);
  process.exit(2);
});

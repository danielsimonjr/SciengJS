// The browser gates of I4c. CI runs this file under Node 22 and under Bun, on each system. It renders through
// the built package (dist/), samples the browser process tree during each render, and checks three things:
// no socket of the tree leaves the host, no process carries the sandbox-off flag, and the screenshot arrives whole.
// A positive control proves that the socket sampler sees loopback sockets on this system.
// With GATE_REQUIRE_NETNS=1 (Linux, inside a network namespace with only loopback) it also checks that the
// namespace is real and that a negative render without the forced flags cannot load an external resource.
// Usage: SCIENG_BROWSER=<browser> [GATE_REQUIRE_NETNS=1] [SCIENG_DIST=<dist folder>] node test/node/browser-gates.mjs
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { externalSockets, noSandboxAmong, rendererCount, sampleTree } from "./browser-probe.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const runtime = typeof globalThis.Bun !== "undefined" ? `bun ${globalThis.Bun.version}` : `node ${process.version}`;
const browser = process.env.SCIENG_BROWSER ?? "";
const requireNetns = process.env.GATE_REQUIRE_NETNS === "1";
const distDir = process.env.SCIENG_DIST ?? join(ROOT, "dist");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];

function gate(name, ok, detail) {
  console.log(`GATE ${name} ${ok ? "PASS" : "FAIL"} ${JSON.stringify({ runtime, platform: process.platform, ...detail })}`);
  if (!ok) failures.push(name);
}

if (browser === "" || !existsSync(browser)) {
  console.error(`SCIENG_BROWSER does not name an existing browser: "${browser}"`);
  process.exit(1);
}
if (!existsSync(join(distDir, "browser", "render.js"))) {
  console.error(`no built package in ${distDir}: run bun run build first`);
  process.exit(1);
}
const { renderHtmlPage } = await import(pathToFileURL(join(distDir, "browser", "render.js")).href);

// The namespace is real when the only network interface is loopback.
if (requireNetns) {
  const interfaces = readdirSync("/sys/class/net").sort();
  gate("netns-loopback-only", interfaces.length === 1 && interfaces[0] === "lo", { interfaces });
}

// Positive control: a child process with a loopback socket must show up in the sampler. Without it, an empty
// socket list would prove nothing.
async function attributionControl() {
  const marker = `sciengjs-probe-${process.pid}-${Date.now()}`;
  // The child keeps itself alive with a timer at the top level, so it lives on even when the connect fails.
  const code = 'const net=require("node:net");const s=net.createServer((c)=>{c.on("error",()=>{});c.end();});s.listen(0,"127.0.0.1",()=>{const c=net.connect(s.address().port,"127.0.0.1");c.on("error",()=>{});setTimeout(()=>{c.destroy();s.close();},8000);});';
  const child = spawn(process.execPath, ["-e", code, marker], { stdio: ["ignore", "ignore", "inherit"] });
  let seen = null;
  try {
    for (let i = 0; i < 30 && seen === null; i++) {
      await sleep(300);
      const sample = await sampleTree(marker);
      const loopback = sample.sockets.filter((socket) => externalSockets([socket]).length === 0);
      if (i % 5 === 0) { const r = spawnSync("sh", ["-c", `ps -axww -o pid=,args= | grep ${marker}; (ss -H -tanp 2>&1 || lsof -nP -iTCP -a -p ${child.pid} 2>&1) | head -20`], { encoding: "utf8" }); console.log(`DIAG i=${i} procs=${sample.processes.length} socks=${JSON.stringify(sample.sockets)}
${r.stdout}${r.stderr}`); }
      if (sample.processes.length > 0 && loopback.length > 0) seen = { processes: sample.processes.length, loopbackSockets: loopback.length };
    }
  } finally {
    child.kill();
  }
  gate("attribution-control", seen !== null, seen ?? { processes: 0, loopbackSockets: 0, marker, childPid: child.pid, childExit: child.exitCode, childSignal: child.signalCode });
}

const NETWORK_PAGE = `<!DOCTYPE html><html><body><p id="drawing">x</p>
<img src="http://t4.sciengjs.invalid/image.png">
<script src="http://t4.sciengjs.invalid/script.js"></script></body></html>`;

// A page that fills a canvas of 2000 by 1500 CSS pixels with noise, so that the screenshot is large.
const BIG_PAGE = `<!DOCTYPE html><html><body style="margin:0"><canvas id="c" width="2000" height="1500"></canvas>
<script>
const c = document.getElementById("c").getContext("2d");
const img = c.createImageData(2000, 1500);
let s = 2463534242;
for (let i = 0; i < img.data.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; img.data[i] = s & 255; }
c.putImageData(img, 0, 0);
</script></body></html>`;

function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Renders one page and samples its browser tree until the render settles. The tree gate checks each sample. */
async function renderSampled(name, req) {
  const samples = [];
  let finished = false;
  let loop = Promise.resolve();
  const onProfile = (profile) => {
    loop = (async () => {
      while (!finished) {
        samples.push(await sampleTree(profile));
        await sleep(200);
      }
    })();
  };
  let result;
  try {
    result = await renderHtmlPage({ ...req, browser, timeoutMs: 60000, onProfile });
  } finally {
    finished = true;
    await loop;
  }
  const processes = samples.flatMap((s) => s.processes);
  const external = samples.flatMap((s) => externalSockets(s.sockets));
  const loopback = samples.reduce((n, s) => n + s.sockets.length - externalSockets(s.sockets).length, 0);
  const sandboxOff = samples.flatMap((s) => noSandboxAmong(s.processes));
  const renderers = Math.max(0, ...samples.map((s) => rendererCount(s.processes)));
  const detail = { samples: samples.length, processesSeen: processes.length, renderers, loopbackSockets: loopback, external: external.map((s) => s.host), sandboxOff: sandboxOff.length };
  gate(`tree-${name}`, samples.length > 0 && (name !== "large-png" || processes.length > 0) && external.length === 0 && sandboxOff.length === 0, detail);
  return { result, renderers };
}

await attributionControl();

const net = await renderSampled("network-png", { format: "png", html: NETWORK_PAGE, width: 400, height: 300, scale: 1 });
const netSize = pngSize(net.result.bytes);
gate("network-page-refused", net.result.blocked.length === 2 && netSize.width === 400 && netSize.height === 300, { blocked: net.result.blocked.length, ...netSize });
await renderSampled("network-pdf", { format: "pdf", html: NETWORK_PAGE, width: 400, height: 300, scale: 1 });
const big = await renderSampled("large-png", { format: "png", html: BIG_PAGE, width: 2000, height: 1500, scale: 2 });
gate("large-tree-renderers", big.renderers > 0, { renderers: big.renderers });
const size = pngSize(big.result.bytes);
const iend = Buffer.from(big.result.bytes.subarray(big.result.bytes.length - 8, big.result.bytes.length - 4)).toString("latin1") === "IEND";
gate("large-png-whole", size.width === 4000 && size.height === 3000 && iend, { ...size, bytes: big.result.bytes.length, iend });

// The negative control: a browser with no forced flags loads no external image and no external script.
// It runs only in the namespace, where a failed load proves that the namespace has no route off the host.
if (requireNetns) {
  const profile = mkdtempSync(join(tmpdir(), "sciengjs-browser-negative-"));
  const page = `<!DOCTYPE html><html><body><img src="http://t4.sciengjs.invalid/image.png" onload="document.body.dataset.image='loaded'" onerror="document.body.dataset.image='failed'"><script src="http://t4.sciengjs.invalid/script.js" onload="document.body.dataset.script='loaded'" onerror="document.body.dataset.script='failed'"></script></body></html>`;
  const url = `data:text/html;base64,${Buffer.from(page).toString("base64")}`;
  const run = spawnSync(browser, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, "--dump-dom", "--virtual-time-budget=15000", url], { encoding: "utf8", timeout: 90000 });
  rmSync(profile, { recursive: true, force: true });
  const dom = run.stdout ?? "";
  gate("negative-control", dom.includes('data-image="failed"') && dom.includes('data-script="failed"'), { status: run.status, image: /data-image="(\w+)"/.exec(dom)?.[1] ?? "none", script: /data-script="(\w+)"/.exec(dom)?.[1] ?? "none" });
}

if (failures.length > 0) {
  console.error(`browser gates failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`browser gates passed under ${runtime}`);

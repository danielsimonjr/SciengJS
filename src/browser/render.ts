import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { RenderError } from "../errors.ts";
import { CdpConnection, connectCdp } from "./cdp.ts";
import { forcedBrowserFlags } from "./flags.ts";
import { MAX_DEVICE_PIXELS } from "./input.ts";
import { makeProfile, removeProfile } from "./profile.ts";
import { startRefusingProxy, type RefusingProxy } from "./proxy.ts";

/** The address of the page that the client loads. The client answers it from memory, so it names no host. */
export const PAGE_URL = "http://sciengjs-page.invalid/";
/** The icon address of the page host. The client answers it locally, as the browser asks for it on its own. */
const FAVICON_URL = "http://sciengjs-page.invalid/favicon.ico";

/**
 * The share of the render time that the page work may use. The rest is the budget for stopping the browser
 * and removing the profile. The budget comes from the worker time limit, so the cleanup runs before the worker ends.
 */
const PAGE_SHARE = 0.8;
const POLL_MS = 100;
const PORT_FILE = "DevToolsActivePort";
/** Codes of a read that Windows holds while the browser writes the port file. Such a read is polled again. */
const HELD_READ_CODES = new Set(["EBUSY", "EPERM", "ENOENT"]);
const IS_WINDOWS = process.platform === "win32";

/** The output of the browser stage for a page. The svg format returns the SVG that the page reports. */
export type HtmlFormat = "png" | "pdf" | "svg" | "dom";

/** A pinned file that the client fulfils for one exact URL, with its bytes read before the browser starts. */
export interface PinnedBytes {
  bytes: Uint8Array;
  mime: string;
}

interface HtmlPageBase {
  html: string;
  /** Path of the browser executable. */
  browser: string;
  /** The time limit of the render, in milliseconds. */
  timeoutMs: number;
  /** Called with the profile folder of this render once the folder exists. A test uses it to find leaks. */
  onProfile?: (profile: string) => void;
  /** The exact pinned URLs that the client fulfils from memory. Every other request is refused. */
  pinned?: ReadonlyMap<string, PinnedBytes>;
  /**
   * The page sets window.__sciengDone to {ok, svg} or {ok, message}. The capture waits for that value. A page
   * that reports ok false rejects with E_INPUT. A png or pdf then draws the diagram in the element sciengjs-diagram.
   */
  awaitDone?: boolean;
  /**
   * The page sets window.__sciengDone, as with awaitDone, but the capture is a plain screenshot of the viewport and
   * the report holds no svg. A viewer page of WebGL uses it. A page that reports ok false rejects with E_INTERNAL
   * when internal is true, else with E_INPUT.
   */
  awaitReady?: boolean;
}

/** One page to draw. A png has a size and a device scale. A pdf has neither. An svg needs awaitDone. */
export type HtmlPageRequest =
  | (HtmlPageBase & { format: "png"; width: number; height: number; scale: number })
  | (HtmlPageBase & { format: "pdf" })
  | (HtmlPageBase & { format: "svg"; awaitDone: true })
  | (HtmlPageBase & { format: "dom" });

/** The bytes that the browser drew, and the requests that it asked for and the client refused. */
export interface HtmlPageResult {
  bytes: Uint8Array;
  /** Each URL that the page asked for and the client refused, in order. */
  blocked: string[];
}

/** The report of a page that sets window.__sciengDone. */
type DoneReport = { ok: true; svg: string } | { ok: false; internal?: boolean; message: string };

/** The box of the diagram in CSS pixels. The png clip and the pdf page size come from it. */
interface DiagramBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the client learns about the browser process while it runs. */
interface LaunchState {
  browser: string;
  error?: Error;
  exited: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function watchChild(child: ChildProcess, browser: string): LaunchState {
  const state: LaunchState = { browser, exited: false, code: null, signal: null };
  child.once("error", (err) => {
    state.error = err;
  });
  child.once("exit", (code, signal) => {
    state.exited = true;
    state.code = code;
    state.signal = signal;
  });
  return state;
}

/** Waits for the DevTools port file. Returns the WebSocket address of the browser. */
async function waitForBrowser(profile: string, state: LaunchState, deadline: number): Promise<string> {
  const file = join(profile, PORT_FILE);
  for (;;) {
    if (state.error !== undefined) {
      throw new RenderError("E_STAGE_MISSING", `cannot start the browser at ${state.browser}: ${state.error.message}`);
    }
    if (state.exited) {
      throw new RenderError(
        "E_STAGE_MISSING",
        `the browser exited with ${state.code ?? state.signal} before it published its DevTools port`,
      );
    }
    if (existsSync(file)) {
      try {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        const port = Number(lines[0]);
        if (Number.isInteger(port) && port > 0 && (lines[1] ?? "") !== "") {
          return `ws://127.0.0.1:${port}${lines[1]}`;
        }
      } catch (err) {
        if (!HELD_READ_CODES.has((err as NodeJS.ErrnoException).code ?? "")) throw err;
      }
    }
    if (Date.now() >= deadline) {
      throw new RenderError("E_TIMEOUT", "the browser did not publish its DevTools port in time");
    }
    await sleep(POLL_MS);
  }
}

/** Rejects when the promise does not settle before the deadline. */
async function withDeadline<T>(work: Promise<T>, deadline: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderError("E_TIMEOUT", message)), Math.max(0, deadline - Date.now()));
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** The request interception of one page. It answers the page and the icon, and refuses every other request. */
class Interceptor {
  readonly blocked: string[] = [];
  readonly faults: Error[] = [];
  private readonly guarded = new Set<string>();
  private readonly sessions = new Map<string, string>();
  private readonly sessionWaiters = new Map<string, (sessionId: string) => void>();

  constructor(
    private readonly cdp: CdpConnection,
    private readonly html: string,
    private readonly pinned: ReadonlyMap<string, PinnedBytes>,
  ) {}

  record = (err: unknown): void => {
    this.faults.push(err instanceof Error ? err : new Error(String(err)));
  };

  /**
   * Intercepts every request of the session and auto-attaches its child targets (frames in another process,
   * workers, pop-ups) paused, so that each child is guarded the same way before it runs. A dedicated worker has no
   * Fetch domain: the session of its page intercepts its requests.
   */
  async guard(sessionId: string, type = "page"): Promise<void> {
    if (this.guarded.has(sessionId)) return;
    this.guarded.add(sessionId);
    const cdp = this.cdp;
    cdp.on("Fetch.requestPaused", sessionId, (params) => this.paused(sessionId, params));
    cdp.on("Target.attachedToTarget", sessionId, (params) => this.attached(params));
    if (type !== "worker") await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
    await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
  }

  /** Guards a new child target, then lets it run. A child that cannot be guarded fails the render. */
  attached(params: unknown): void {
    const { sessionId, targetInfo } = params as { sessionId: string; targetInfo: { targetId: string; type: string } };
    this.guard(sessionId, targetInfo.type)
      .then(() => {
        this.sessions.set(targetInfo.targetId, sessionId);
        this.sessionWaiters.get(targetInfo.targetId)?.(sessionId);
        return this.cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
      })
      .catch(this.record);
  }

  /** The session of a target, once the target is attached and guarded. */
  sessionOf(targetId: string): Promise<string> {
    const known = this.sessions.get(targetId);
    if (known !== undefined) return Promise.resolve(known);
    return new Promise((resolve) => this.sessionWaiters.set(targetId, resolve));
  }

  private paused(sessionId: string, params: unknown): void {
    const cdp = this.cdp;
    const paused = params as { requestId: string; request: { url: string } };
    if (paused.request.url === FAVICON_URL) {
      // The browser asks for an icon of the page host by itself. The client answers it with no content, so no
      // request leaves the process and the icon is not counted as a request of the page.
      cdp
        .send("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 204, responseHeaders: [], body: "" }, sessionId)
        .catch(this.record);
      return;
    }
    if (paused.request.url === PAGE_URL) {
      cdp
        .send(
          "Fetch.fulfillRequest",
          {
            requestId: paused.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
            body: Buffer.from(this.html, "utf8").toString("base64"),
          },
          sessionId,
        )
        .catch(this.record);
      return;
    }
    const asset = this.pinned.get(paused.request.url);
    if (asset !== undefined) {
      // A pinned build is fulfilled from the bytes that the caller read from the engine package. No request leaves the process.
      cdp
        .send(
          "Fetch.fulfillRequest",
          {
            requestId: paused.requestId,
            responseCode: 200,
            // A module script and a script with integrity are cross-origin requests, so the reply allows any origin.
            responseHeaders: [
              { name: "Content-Type", value: asset.mime },
              { name: "Access-Control-Allow-Origin", value: "*" },
            ],
            body: Buffer.from(asset.bytes).toString("base64"),
          },
          sessionId,
        )
        .catch(this.record);
      return;
    }
    this.blocked.push(paused.request.url);
    cdp.send("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }, sessionId).catch(this.record);
  }
}

/**
 * Loads the page in a new target, refuses every request that is not the page, then captures it. Every request
 * to the browser carries the deadline, and the whole capture runs under it. The load wait keys on the loader of
 * the navigation, so a load event of an earlier document does not count.
 */
export async function capturePage(cdp: CdpConnection, req: HtmlPageRequest, deadline: number): Promise<HtmlPageResult> {
  return withDeadline(capture(cdp, req), deadline, "the page did not load in time");
}

async function capture(cdp: CdpConnection, req: HtmlPageRequest): Promise<HtmlPageResult> {
  const guard = new Interceptor(cdp, req.html, req.pinned ?? new Map());
  // A new page that the page opens (window.open) is a new target of the browser. The browser-level auto-attach
  // pauses it until it is guarded. A target of the browser itself (for example a built-in extension) is not a
  // target of the page: the client lets it run, and the forced flags keep its connections on the proxy.
  cdp.on("Target.attachedToTarget", undefined, (params) => {
    const { sessionId, targetInfo } = params as { sessionId: string; targetInfo: { type: string } };
    if (targetInfo.type === "page") {
      guard.attached(params);
    } else {
      cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(guard.record);
    }
  });
  await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const target = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
  // The browser-level auto-attach attaches the new target and guards it. The client waits for that session.
  const s = await guard.sessionOf(target.targetId);

  const loads = new Set<string>();
  let onLoad: (() => void) | undefined;
  cdp.on("Page.lifecycleEvent", s, (params) => {
    const event = params as { name: string; loaderId: string };
    if (event.name === "load") {
      loads.add(event.loaderId);
      onLoad?.();
    }
  });
  await cdp.send("Page.enable", {}, s);
  await cdp.send("Page.setLifecycleEventsEnabled", { enabled: true }, s);
  if (req.format === "png" && req.awaitDone !== true) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: req.width, height: req.height, deviceScaleFactor: req.scale, mobile: false },
      s,
    );
  }
  const nav = (await cdp.send("Page.navigate", { url: PAGE_URL }, s)) as { loaderId?: string; errorText?: string };
  if (nav.errorText !== undefined && nav.errorText !== "") {
    throw new RenderError("E_INTERNAL", `the browser did not load the page: ${nav.errorText}`);
  }
  const loaderId = nav.loaderId ?? "";
  // The load event can come before the reply of Page.navigate, so the seen loaders are checked first.
  if (!loads.has(loaderId)) {
    await new Promise<void>((resolve) => {
      onLoad = () => {
        if (loads.has(loaderId)) resolve();
      };
    });
  }

  let bytes: Uint8Array;
  if (req.awaitReady === true) {
    const done = await awaitDoneReport(cdp, s);
    if (!done.ok) throw new RenderError(done.internal === true ? "E_INTERNAL" : "E_INPUT", done.message);
  }
  if (req.awaitDone === true) {
    const done = await awaitDoneReport(cdp, s);
    // A page that cannot run the pinned build is a fault of the engine, not of the source.
    if (!done.ok) throw new RenderError(done.internal === true ? "E_INTERNAL" : "E_INPUT", done.message);
    if (req.format === "svg") {
      bytes = new TextEncoder().encode(done.svg);
    } else {
      bytes = await drawDiagram(cdp, s, req);
    }
  } else if (req.format === "pdf") {
    await fitPageToDiagram(cdp, s);
    bytes = await printPdf(cdp, s);
  } else if (req.format === "png") {
    const data = (await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, s)) as { data: string };
    bytes = Buffer.from(data.data, "base64");
  } else if (req.format === "dom") {
    // The DOM after the page scripts run. The converter of html to md reads it.
    const reply = (await cdp.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true }, s)) as {
      result?: { value?: unknown };
    };
    bytes = new TextEncoder().encode(typeof reply.result?.value === "string" ? reply.result.value : "");
  } else {
    throw new RenderError("E_INTERNAL", "the page format is not drawn by this stage");
  }
  if (guard.faults.length > 0) {
    throw new RenderError("E_INTERNAL", `the browser rejected a page request: ${guard.faults[0]?.message ?? "unknown"}`);
  }
  return { bytes, blocked: guard.blocked };
}

/** Waits until the page sets window.__sciengDone. The wait is one promise that the browser resolves. */
async function awaitDoneReport(cdp: CdpConnection, s: string): Promise<DoneReport> {
  const expression =
    "new Promise((resolve) => { const poll = () => (window.__sciengDone ? resolve(window.__sciengDone) : setTimeout(poll, 50)); poll(); })";
  const reply = (await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s)) as {
    result?: { value?: DoneReport };
    exceptionDetails?: unknown;
  };
  const value = reply.result?.value;
  if (reply.exceptionDetails !== undefined || value === undefined) {
    throw new RenderError("E_INTERNAL", "the page did not report a result");
  }
  return value;
}

/** Reads the box of the first SVG of the diagram element, or undefined when the page has no diagram. */
async function diagramBox(cdp: CdpConnection, s: string): Promise<DiagramBox | undefined> {
  const expression =
    '(() => { const e = document.querySelector("#sciengjs-diagram svg"); if (!e) return null; const r = e.getBoundingClientRect(); ' +
    "return { x: r.x, y: r.y, width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()";
  const reply = (await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, s)) as {
    result?: { value?: DiagramBox | null };
  };
  const box = reply.result?.value;
  return box === null || box === undefined || box.width <= 0 || box.height <= 0 ? undefined : box;
}

/** Draws the diagram of a page that reports done: a png clipped to the diagram box. */
async function drawDiagram(cdp: CdpConnection, s: string, req: HtmlPageRequest): Promise<Uint8Array> {
  if (req.format === "svg" || req.format === "dom") throw new RenderError("E_INTERNAL", "an svg or dom is not drawn from a box");
  const box = await diagramBox(cdp, s);
  if (box === undefined) throw new RenderError("E_INPUT", "the diagram has no drawable size");
  if (req.format === "pdf") {
    await fitPageToDiagram(cdp, s);
    return printPdf(cdp, s);
  }
  if (box.width * req.scale * (box.height * req.scale) > MAX_DEVICE_PIXELS) {
    throw new RenderError("E_INPUT", `the png must not have more than ${MAX_DEVICE_PIXELS} device pixels`);
  }
  // The viewport takes the size of the diagram and the device scale of the request, so a wide diagram is not
  // clipped and its pixel width is its CSS width times the scale.
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: Math.ceil(box.x + box.width), height: Math.ceil(box.y + box.height), deviceScaleFactor: req.scale, mobile: false },
    s,
  );
  const fitted = (await diagramBox(cdp, s)) ?? box;
  const data = (await cdp.send(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: false,
      clip: { x: fitted.x, y: fitted.y, width: fitted.width, height: fitted.height, scale: 1 },
    },
    s,
  )) as { data: string };
  return Buffer.from(data.data, "base64");
}

/** Sets the pdf page size to the diagram box, so that the pdf holds one page of the diagram. A page with no diagram keeps its size. */
async function fitPageToDiagram(cdp: CdpConnection, s: string): Promise<void> {
  const box = await diagramBox(cdp, s);
  if (box === undefined) return;
  const css = `@page { size: ${box.width}px ${box.height}px; margin: 0 }`;
  await cdp.send(
    "Runtime.evaluate",
    { expression: `(() => { const st = document.createElement("style"); st.textContent = ${JSON.stringify(css)}; document.head.appendChild(st); })()` },
    s,
  );
}

async function printPdf(cdp: CdpConnection, s: string): Promise<Uint8Array> {
  const data = (await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true }, s)) as { data: string };
  return Buffer.from(data.data, "base64");
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Waits for the browser to exit. Returns false when it is still running at the deadline. */
async function waitForExit(child: ChildProcess, deadline: number): Promise<boolean> {
  if (hasExited(child)) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exited = new Promise<boolean>((resolve) => {
    child.once("exit", () => resolve(true));
    timer = setTimeout(() => resolve(hasExited(child)), Math.max(0, deadline - Date.now()));
  });
  const result = await exited;
  clearTimeout(timer);
  return result;
}

/**
 * Kills the browser and every process that it started. On POSIX the browser leads its own process group, so the
 * group dies with one signal, also after the browser itself exited. On Windows `taskkill /T` walks the tree of a
 * live process id. After the browser exited, Windows can give its id to an unrelated process, so the call is
 * skipped then. A process that is already gone is not an error. macOS refuses the group signal with EPERM when only
 * zombies are left in the group. After the browser exited, EPERM also means that no process is left to kill.
 * `deps` holds the platform and the kill function, so that tests drive the POSIX branch on every platform.
 */
export function killTree(
  child: ChildProcess,
  deps: { windows: boolean; kill: (pid: number, signal: NodeJS.Signals) => boolean } = { windows: IS_WINDOWS, kill: process.kill.bind(process) },
): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (deps.windows) {
    if (hasExited(child)) return;
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    deps.kill(-pid, "SIGKILL");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH" || (code === "EPERM" && hasExited(child))) return;
    throw err;
  }
}

/**
 * Asks the browser to close, then waits for its exit. A browser still running at the deadline is killed with its
 * process tree. The tree kill also runs after a clean close, so that no helper process stays.
 */
async function stopBrowser(cdp: CdpConnection | undefined, child: ChildProcess, deadline: number): Promise<void> {
  if (cdp !== undefined) {
    // The exit wait below decides whether the browser stopped. A failed close request is not an error by itself.
    await cdp.send("Browser.close", {}, undefined, deadline).catch(() => undefined);
    cdp.close();
  }
  const closed = await waitForExit(child, deadline);
  killTree(child);
  if (closed) return;
  // The kill is sure to end the process, but its exit event needs a moment. The wait gets a short floor.
  if (!(await waitForExit(child, Math.max(deadline, Date.now() + 1000)))) {
    throw new RenderError("E_INTERNAL", "the browser did not stop after it was killed");
  }
}

/**
 * Draws one HTML page in a new headless browser and returns the bytes of a PNG or a PDF.
 * The browser runs with a new profile, the forced flags and a refusing proxy. The browser sandbox stays on.
 * The profile, the proxy and the browser are removed on every path before the function returns. One deadline
 * covers the whole cleanup.
 */
export async function renderHtmlPage(req: HtmlPageRequest): Promise<HtmlPageResult> {
  const pageBudgetMs = Math.floor(req.timeoutMs * PAGE_SHARE);
  const cleanupBudgetMs = req.timeoutMs - pageBudgetMs;
  const deadline = Date.now() + pageBudgetMs;
  let proxy: RefusingProxy | undefined;
  let profile: string | undefined;
  let child: ChildProcess | undefined;
  let state: LaunchState | undefined;
  let cdp: CdpConnection | undefined;
  try {
    proxy = await startRefusingProxy();
    profile = makeProfile();
    req.onProfile?.(profile);
    try {
      child = spawn(req.browser, [...forcedBrowserFlags({ profileDir: profile, proxyPort: proxy.port }), "about:blank"], {
        stdio: "ignore",
        windowsHide: true,
        // On POSIX the browser leads a new process group, so that the cleanup can kill the whole tree.
        detached: !IS_WINDOWS,
      });
    } catch (err) {
      // Bun and Node on Windows throw at the spawn call for a file that cannot run.
      throw new RenderError("E_STAGE_MISSING", `cannot start the browser at ${req.browser}: ${(err as Error).message}`);
    }
    state = watchChild(child, req.browser);
    const address = await waitForBrowser(profile, state, deadline);
    cdp = await connectCdp(address, deadline);
    cdp.setDeadline(deadline);
    return await capturePage(cdp, req, deadline);
  } finally {
    const cleanupDeadline = Date.now() + cleanupBudgetMs;
    try {
      if (child !== undefined && state?.error === undefined) await stopBrowser(cdp, child, cleanupDeadline);
    } finally {
      try {
        await proxy?.close();
      } finally {
        if (profile !== undefined) await removeProfile(profile, cleanupDeadline);
      }
    }
  }
}

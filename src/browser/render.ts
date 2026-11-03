import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { RenderError } from "../errors.ts";
import { CdpConnection } from "./cdp.ts";
import { forcedBrowserFlags } from "./flags.ts";
import { makeProfile, removeProfile } from "./profile.ts";
import { startRefusingProxy } from "./proxy.ts";

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

/** The output of the browser stage for an HTML page. */
export type HtmlFormat = "png" | "pdf";

interface HtmlPageBase {
  html: string;
  /** Path of the browser executable. */
  browser: string;
  /** The time limit of the render, in milliseconds. */
  timeoutMs: number;
}

/** One page to draw. A png has a size and a device scale. A pdf has neither. */
export type HtmlPageRequest =
  | (HtmlPageBase & { format: "png"; width: number; height: number; scale: number })
  | (HtmlPageBase & { format: "pdf" });

/** The bytes that the browser drew, and the requests that it asked for and the client refused. */
export interface HtmlPageResult {
  bytes: Uint8Array;
  /** Each URL that the page asked for and the client refused, in order. */
  blocked: string[];
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

/** Opens the browser-level WebSocket and returns a connection on it. */
function connect(address: string): Promise<CdpConnection> {
  const socket = new WebSocket(address);
  return new Promise<CdpConnection>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(new CdpConnection(socket)), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new RenderError("E_STAGE_MISSING", `cannot open the DevTools socket ${address}`)),
      { once: true },
    );
  });
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

/** Loads the page in a new target, refuses every request that is not the page, then captures it. */
async function capturePage(cdp: CdpConnection, req: HtmlPageRequest, deadline: number): Promise<HtmlPageResult> {
  const blocked: string[] = [];
  const faults: Error[] = [];
  const target = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
  const attached = (await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true })) as {
    sessionId: string;
  };
  const s = attached.sessionId;
  const record = (err: unknown): void => {
    faults.push(err instanceof Error ? err : new Error(String(err)));
  };

  cdp.on("Fetch.requestPaused", s, (params) => {
    const paused = params as { requestId: string; request: { url: string } };
    if (paused.request.url === FAVICON_URL) {
      // The browser asks for an icon of the page host by itself. The client answers it with no content, so no
      // request leaves the process and the icon is not counted as a request of the page.
      cdp.send("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 204, responseHeaders: [], body: "" }, s).catch(record);
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
            body: Buffer.from(req.html, "utf8").toString("base64"),
          },
          s,
        )
        .catch(record);
      return;
    }
    blocked.push(paused.request.url);
    cdp.send("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }, s).catch(record);
  });

  await cdp.send("Page.enable", {}, s);
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, s);
  if (req.format === "png") {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: req.width, height: req.height, deviceScaleFactor: req.scale, mobile: false },
      s,
    );
  }
  const loaded = new Promise<void>((resolve) => cdp.on("Page.loadEventFired", s, () => resolve()));
  await cdp.send("Page.navigate", { url: PAGE_URL }, s);
  await withDeadline(loaded, deadline, "the page did not load in time");

  const data =
    req.format === "png"
      ? ((await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, s)) as { data: string })
      : ((await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true }, s)) as { data: string });
  if (faults.length > 0) {
    throw new RenderError("E_INTERNAL", `the browser rejected a page request: ${faults[0]?.message ?? "unknown"}`);
  }
  return { bytes: Buffer.from(data.data, "base64"), blocked };
}

/** Waits for the browser to exit. Returns false when it is still running at the deadline. */
async function waitForExit(child: ChildProcess, budgetMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exited = new Promise<boolean>((resolve) => {
    child.once("exit", () => resolve(true));
    timer = setTimeout(() => resolve(false), budgetMs);
  });
  const result = await exited;
  clearTimeout(timer);
  return result;
}

/** Asks the browser to close, then waits for its exit. A browser still running after the budget is killed. */
async function stopBrowser(cdp: CdpConnection | undefined, child: ChildProcess, budgetMs: number): Promise<void> {
  if (cdp !== undefined) {
    // The exit wait below decides whether the browser stopped. A failed close request is not an error by itself.
    await cdp.send("Browser.close").catch(() => undefined);
    cdp.close();
  }
  if (await waitForExit(child, budgetMs)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child, budgetMs))) {
    throw new RenderError("E_INTERNAL", "the browser did not stop after it was killed");
  }
}

/**
 * Draws one HTML page in a new headless browser and returns the bytes of a PNG or a PDF.
 * The browser runs with a new profile, the forced flags and a refusing proxy. It never runs with --no-sandbox.
 * The profile, the proxy and the browser are removed on every path before the function returns.
 */
export async function renderHtmlPage(req: HtmlPageRequest): Promise<HtmlPageResult> {
  const pageBudgetMs = Math.floor(req.timeoutMs * PAGE_SHARE);
  const cleanupBudgetMs = req.timeoutMs - pageBudgetMs;
  const proxy = await startRefusingProxy();
  const profile = makeProfile();
  const child = spawn(req.browser, [...forcedBrowserFlags({ profileDir: profile, proxyPort: proxy.port }), "about:blank"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const state = watchChild(child, req.browser);
  let cdp: CdpConnection | undefined;
  try {
    const deadline = Date.now() + pageBudgetMs;
    const address = await waitForBrowser(profile, state, deadline);
    cdp = await connect(address);
    return await capturePage(cdp, req, deadline);
  } finally {
    try {
      if (state.error === undefined) await stopBrowser(cdp, child, cleanupBudgetMs);
    } finally {
      await proxy.close();
      await removeProfile(profile, cleanupBudgetMs);
    }
  }
}

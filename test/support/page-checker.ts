/**
 * A test-only page checker. It starts a headless Chrome at a given path, loads one local HTML file over
 * the Chrome DevTools Protocol, and reports each script error, console error and empty drawing.
 *
 * Nothing in src/ imports this file. The browser starts with a new temporary profile and no extensions.
 * On every path the checker asks the browser to close, confirms that its DevTools port stopped answering,
 * and then removes the profile. A browser that does not stop is reported as an error, never as clean.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface PageCheckOptions {
  /** Absolute path of the Chrome or Chromium executable. */
  browserPath: string;
  /** Absolute path of the HTML file to load. */
  htmlPath: string;
  /** CSS selectors of elements that must draw something: each needs a child element and a non-zero box. */
  drawingSelectors?: string[];
  /** Time allowed for the start of the browser and for the page load, in milliseconds. */
  startTimeoutMs?: number;
  /** Time the page runs after load, so that late script errors surface, in milliseconds. */
  settleMs?: number;
  /** Time allowed for the browser to stop after the close request, in milliseconds. */
  stopTimeoutMs?: number;
}

export interface PageCheckResult {
  ok: boolean;
  /** One line per problem. Empty when the page passes. */
  problems: string[];
}

const DEFAULT_START_TIMEOUT_MS = 20000;
const DEFAULT_SETTLE_MS = 500;
const DEFAULT_STOP_TIMEOUT_MS = 20000;
const POLL_MS = 100;
const PROFILE_DELETE_DEADLINE_MS = 30000;
const CHROME_ARGS = [
  "--headless=new",
  "--remote-debugging-port=0",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-gpu",
  // The page is a local test fixture. The sandbox is off so that the runner's container can start Chrome.
  "--no-sandbox",
  // An elevated session makes Chrome relaunch itself. This flag keeps the launched process the browser.
  "--do-not-de-elevate",
  // No crash reporter: its helper process holds files in the profile after the browser has stopped.
  "--disable-breakpad",
  "--disable-crash-reporter",
];

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`cannot open the DevTools socket ${url}`)), { once: true });
  });
}

/** True when the DevTools port of the browser still answers. */
async function portAnswers(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/** Polls the profile folder until the browser has published its DevTools port. */
async function waitForDevToolsPort(profile: string, deadline: number): Promise<number> {
  const file = join(profile, "DevToolsActivePort");
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const port = Number(readFileSync(file, "utf8").split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`the browser did not publish its DevTools port in time (${file})`);
}

/**
 * Asks the browser to close over DevTools, then waits until its port stops answering. The launched
 * process can differ from the browser (Chrome relaunches itself), so the port is the signal, not the process.
 * Throws when the port still answers at the deadline.
 */
async function closeBrowser(port: number | undefined, stopTimeoutMs: number): Promise<void> {
  if (port !== undefined && (await portAnswers(port))) {
    try {
      const info = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
      const socket = await openSocket(info.webSocketDebuggerUrl);
      socket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      socket.close();
    } catch {
      // The close request failed. The wait below decides whether the browser stopped anyway.
    }
  }
  const deadline = Date.now() + stopTimeoutMs;
  if (port !== undefined) {
    while (Date.now() < deadline && (await portAnswers(port))) await sleep(POLL_MS);
  }
  if (port !== undefined && (await portAnswers(port))) {
    throw new Error(`the browser on port ${port} did not stop within ${stopTimeoutMs} ms`);
  }
}

/** Removes the profile. Chrome holds files for a moment after it stops, so a busy folder is retried. */
async function removeProfile(profile: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EBUSY" || Date.now() >= deadline) throw err;
      await sleep(POLL_MS * 5);
    }
  }
}

/** The page-side check of one selector. It returns a short string when the element draws nothing. */
function drawingExpression(selector: string): string {
  const label = JSON.stringify(selector);
  return `(() => {
    const el = document.querySelector(${label});
    if (!el) return "no element matches " + ${label};
    const box = el.getBoundingClientRect();
    if (el.querySelectorAll("*").length === 0) return "empty drawing: " + ${label} + " has no rendered child";
    if (!(box.width > 0 && box.height > 0)) return "empty drawing: " + ${label} + " has a zero box";
    return "";
  })()`;
}

/** Runs one page check. The browser is closed and the profile removed before the promise settles. */
export async function checkPage(options: PageCheckOptions): Promise<PageCheckResult> {
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
  const problems: string[] = [];
  const profile = mkdtempSync(join(tmpdir(), "sciengjs-page-check-"));
  let child: ChildProcess | undefined;
  let port: number | undefined;
  let socket: WebSocket | undefined;

  try {
    if (!existsSync(options.browserPath)) {
      throw new Error(`browser path does not exist: ${options.browserPath}`);
    }
    child = spawn(options.browserPath, [...CHROME_ARGS, `--user-data-dir=${profile}`, "about:blank"], {
      stdio: "ignore",
      windowsHide: true,
    });
    // A spawn that fails emits an error event. Without a listener the process would crash.
    const spawnFailure = new Promise<never>((_, reject) => {
      child!.once("error", (err) => reject(new Error(`cannot start the browser at ${options.browserPath}: ${err.message}`)));
    });
    spawnFailure.catch(() => undefined);
    port = await Promise.race([waitForDevToolsPort(profile, Date.now() + startTimeoutMs), spawnFailure]);

    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("the browser has no page target");
    socket = await openSocket(page.webSocketDebuggerUrl);

    let nextId = 1;
    const pending = new Map<number, (m: CdpMessage) => void>();
    let markLoaded: () => void = () => undefined;
    const loadPromise = new Promise<void>((resolve) => {
      markLoaded = resolve;
    });

    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as CdpMessage;
      if (msg.id !== undefined) {
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const details = msg.params?.exceptionDetails as { text?: string; exception?: { description?: string } };
        problems.push(`script error: ${details?.exception?.description ?? details?.text ?? "unknown"}`);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
        const args = (msg.params.args as { value?: unknown; description?: string }[]) ?? [];
        problems.push(`console error: ${args.map((a) => String(a.value ?? a.description ?? "")).join(" ")}`);
      } else if (msg.method === "Log.entryAdded" && (msg.params?.entry as { level?: string })?.level === "error") {
        problems.push(`log error: ${(msg.params?.entry as { text?: string }).text ?? ""}`);
      } else if (msg.method === "Page.loadEventFired") {
        markLoaded();
      }
    });

    const send = (method: string, params: Record<string, unknown> = {}): Promise<CdpMessage> => {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m)));
        socket!.send(JSON.stringify({ id, method, params }));
      });
    };

    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: pathToFileURL(options.htmlPath).href });

    const loadDeadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("the page did not finish loading in time")), startTimeoutMs),
    );
    await Promise.race([loadPromise, loadDeadline]);
    await sleep(settleMs);

    for (const selector of options.drawingSelectors ?? []) {
      const reply = await send("Runtime.evaluate", { expression: drawingExpression(selector), returnByValue: true });
      const value = (reply.result as { result?: { value?: string } } | undefined)?.result?.value ?? "";
      if (value !== "") problems.push(value);
    }
    return { ok: problems.length === 0, problems };
  } finally {
    socket?.close();
    try {
      await closeBrowser(port, stopTimeoutMs);
    } finally {
      try {
        // The profile can be removed only when no browser process holds it. The launched process is stopped last.
        await removeProfile(profile, PROFILE_DELETE_DEADLINE_MS);
      } finally {
        if (child !== undefined && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
    }
  }
}

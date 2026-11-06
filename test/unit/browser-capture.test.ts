import { describe, expect, test } from "bun:test";
import { CdpConnection, type CdpSocket } from "../../src/browser/cdp.ts";
import { capturePage, type HtmlPageRequest } from "../../src/browser/render.ts";
import { RenderError } from "../../src/errors.ts";

type Sent = { id: number; method: string; params?: unknown; sessionId?: string };

/**
 * A scripted browser. It answers each request with an empty result, except the methods in `silent` (no answer)
 * and `failing` (a protocol error). Target.createTarget answers T1 and attaches session S1. Page.navigate answers
 * loader L1. No load event is sent unless `load` is true.
 */
class ScriptedBrowser implements CdpSocket {
  readonly sent: Sent[] = [];
  private readonly listeners = new Map<string, Array<(ev: { data?: unknown }) => void>>();

  constructor(private readonly script: { silent?: string[]; failing?: string[]; load?: boolean; holdCreateReplyMs?: number } = {}) {}

  send(text: string): void {
    const msg = JSON.parse(text) as Sent;
    this.sent.push(msg);
    queueMicrotask(() => this.answer(msg));
  }

  close(): void {
    this.deliver("close", {});
  }

  addEventListener(type: string, listener: (ev: { data?: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  private deliver(type: string, ev: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(ev);
  }

  private message(payload: unknown): void {
    this.deliver("message", { data: JSON.stringify(payload) });
  }

  private answer(msg: Sent): void {
    if (this.script.silent?.includes(msg.method)) return;
    const base = msg.sessionId === undefined ? {} : { sessionId: msg.sessionId };
    if (this.script.failing?.includes(msg.method)) {
      this.message({ id: msg.id, ...base, error: { message: `${msg.method} refused` } });
      return;
    }
    if (msg.method === "Target.createTarget") {
      const reply = (): void => this.message({ id: msg.id, result: { targetId: "T1" } });
      if (this.script.holdCreateReplyMs !== undefined) {
        // The attach (and so the guard and its failure) comes before the reply of Target.createTarget.
        this.message({ method: "Target.attachedToTarget", params: { sessionId: "S1", targetInfo: { targetId: "T1", type: "page" } } });
        setTimeout(reply, this.script.holdCreateReplyMs);
        return;
      }
      reply();
      this.message({ method: "Target.attachedToTarget", params: { sessionId: "S1", targetInfo: { targetId: "T1", type: "page" } } });
      return;
    }
    if (msg.method === "Page.navigate") {
      this.message({ id: msg.id, ...base, result: { loaderId: "L1" } });
      if (this.script.load === true) {
        this.message({ method: "Page.lifecycleEvent", sessionId: "S1", params: { name: "load", loaderId: "L1" } });
      }
      return;
    }
    this.message({ id: msg.id, ...base, result: {} });
  }
}

const REQ: HtmlPageRequest = { html: "<p>x</p>", format: "dom" } as HtmlPageRequest;

async function captureError(browser: ScriptedBrowser, budgetMs = 300): Promise<RenderError> {
  try {
    await capturePage(new CdpConnection(browser), REQ, Date.now() + budgetMs);
  } catch (err) {
    return err as RenderError;
  }
  throw new Error("the capture did not fail");
}

describe("capturePage: a capture that runs out of time names its step", () => {
  test("no load event: E_TIMEOUT names the wait for the load event", async () => {
    const err = await captureError(new ScriptedBrowser());
    expect(err.code).toBe("E_TIMEOUT");
    expect(err.message).toContain("the page did not load in time");
    expect(err.message).toContain("waiting for the load event");
  });

  test("no answer to Page.navigate: E_TIMEOUT names Page.navigate", async () => {
    const err = await captureError(new ScriptedBrowser({ silent: ["Page.navigate"] }));
    expect(err.code).toBe("E_TIMEOUT");
    expect(err.message).toContain("Page.navigate");
  });

  test("the message gives the time spent in the step, in seconds", async () => {
    const err = await captureError(new ScriptedBrowser());
    expect(err.message).toMatch(/for \d+\.\d s/);
  });
});

describe("capturePage: a page that cannot be guarded fails at once with the cause", () => {
  test("Fetch.enable refused on the page session: the capture rejects before the deadline and names the refusal", async () => {
    const started = Date.now();
    const err = await captureError(new ScriptedBrowser({ failing: ["Fetch.enable"] }), 5000);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(err.message).not.toContain("did not load in time");
    expect(err.message).toContain("Fetch.enable refused");
  });

  test("the guard fails before the capture asks for the session: the capture still rejects at once with the cause", async () => {
    const started = Date.now();
    const err = await captureError(new ScriptedBrowser({ failing: ["Fetch.enable"], holdCreateReplyMs: 50 }), 5000);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(err.message).not.toContain("did not load in time");
    expect(err.message).toContain("Fetch.enable refused");
  });
});

describe("capturePage: a guard fault after the session is known is named by the timeout", () => {
  test("Runtime.runIfWaitingForDebugger refused: E_TIMEOUT names the step and the refusal", async () => {
    const err = await captureError(new ScriptedBrowser({ failing: ["Runtime.runIfWaitingForDebugger"] }));
    expect(err.code).toBe("E_TIMEOUT");
    expect(err.message).toContain("waiting for the load event");
    expect(err.message).toContain("Runtime.runIfWaitingForDebugger refused");
  });

  test("no fault: the timeout message names no rejection", async () => {
    const err = await captureError(new ScriptedBrowser());
    expect(err.message).not.toContain("rejected");
  });
});

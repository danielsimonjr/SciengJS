import { RenderError } from "../errors.ts";

/** The part of a WebSocket that the client uses. The global WebSocket of Node 22 and Bun meets it. */
export interface CdpSocket {
  send(text: string): void;
  close(): void;
  addEventListener(type: string, listener: (ev: { data?: unknown }) => void): void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface EventHandlerEntry {
  method: string;
  sessionId: string | undefined;
  handler: (params: unknown) => void;
}

const SOCKET_CLOSED_MESSAGE = "the DevTools socket closed";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return JSON.stringify(error);
}

/** One Chrome DevTools Protocol connection. It matches each reply to its request and routes each event. */
export class CdpConnection {
  private readonly socket: CdpSocket;
  private closed = false;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly eventHandlers: EventHandlerEntry[] = [];
  private deadline: number | undefined;

  constructor(socket: CdpSocket) {
    this.socket = socket;
    socket.addEventListener("message", (ev: { data?: unknown }) => {
      this.handleMessageData(ev.data);
    });
    socket.addEventListener("close", () => {
      this.handleSocketClose();
    });
  }

  /** Sets the default deadline (a Date.now() time) of each later request that names no deadline of its own. */
  setDeadline(deadline: number | undefined): void {
    this.deadline = deadline;
  }

  /** The count of requests that wait for a reply. */
  pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Sends one request. A request with no reply before its deadline rejects with E_TIMEOUT, and its pending entry
   * is removed, so that a late reply is ignored.
   */
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    deadline: number | undefined = this.deadline,
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error(SOCKET_CLOSED_MESSAGE));
    }
    const id = this.nextId++;
    const payload: Record<string, unknown> = {
      id,
      method,
      params: params ?? {},
    };
    if (sessionId !== undefined) {
      payload.sessionId = sessionId;
    }
    return new Promise<unknown>((resolve, reject) => {
      const timer =
        deadline === undefined
          ? undefined
          : setTimeout(() => {
              this.pending.delete(id);
              reject(new RenderError("E_TIMEOUT", `the browser did not answer ${method} in time`));
            }, Math.max(0, deadline - Date.now()));
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(payload));
    });
  }

  on(
    method: string,
    sessionId: string | undefined,
    handler: (params: unknown) => void
  ): void {
    this.eventHandlers.push({ method, sessionId, handler });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectAllPending();
    this.socket.close();
  }

  private handleMessageData(data: unknown): void {
    if (typeof data !== "string") {
      return;
    }
    const parsed = safeJsonParse(data);
    if (parsed === null || typeof parsed !== "object") {
      return;
    }
    const message = parsed as {
      id?: unknown;
      method?: unknown;
      params?: unknown;
      result?: unknown;
      error?: unknown;
      sessionId?: unknown;
    };

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (pending === undefined) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error !== undefined && message.error !== null) {
        pending.reject(new Error(errorText(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (typeof message.method !== "string") {
      return;
    }
    const eventSessionId =
      typeof message.sessionId === "string" ? message.sessionId : undefined;
    for (const entry of this.eventHandlers) {
      if (entry.method === message.method && entry.sessionId === eventSessionId) {
        entry.handler(message.params);
      }
    }
  }

  private handleSocketClose(): void {
    this.closed = true;
    this.rejectAllPending();
  }

  private rejectAllPending(): void {
    for (const pending of Array.from(this.pending.values())) {
      clearTimeout(pending.timer);
      pending.reject(new Error(SOCKET_CLOSED_MESSAGE));
    }
    this.pending.clear();
  }
}

/** The WebSocket of the runtime as a CdpSocket. */
function runtimeSocket(address: string): CdpSocket {
  return new WebSocket(address) as unknown as CdpSocket;
}

/**
 * Opens a DevTools socket and returns a connection on it. An error event, or a close before the open, rejects with
 * E_STAGE_MISSING. No open before the deadline closes the socket and rejects with E_TIMEOUT. The E_TIMEOUT message
 * gives the socket wait time. If the caller gives a context, the message also gives the text of `context`.
 */
export function connectCdp(
  address: string,
  deadline: number,
  makeSocket: (address: string) => CdpSocket = runtimeSocket,
  context?: () => string,
): Promise<CdpConnection> {
  const started = Date.now();
  const socket = makeSocket(address);
  return new Promise<CdpConnection>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => {
        socket.close();
        const waited = ((Date.now() - started) / 1000).toFixed(1);
        const more = context === undefined ? "" : `; ${context()}`;
        reject(new RenderError("E_TIMEOUT", `the DevTools socket ${address} did not open in time: it waited ${waited} s${more}`));
      });
    }, Math.max(0, deadline - Date.now()));
    socket.addEventListener("open", () => settle(() => resolve(new CdpConnection(socket))));
    const fail = (): void => settle(() => reject(new RenderError("E_STAGE_MISSING", `cannot open the DevTools socket ${address}`)));
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
  });
}

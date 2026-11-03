/** The part of a WebSocket that the client uses. The global WebSocket of Node 22 and Bun meets it. */
export interface CdpSocket {
  send(text: string): void;
  close(): void;
  addEventListener(type: string, listener: (ev: { data?: unknown }) => void): void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
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

  constructor(socket: CdpSocket) {
    this.socket = socket;
    socket.addEventListener("message", (ev: { data?: unknown }) => {
      this.handleMessageData(ev.data);
    });
    socket.addEventListener("close", () => {
      this.handleSocketClose();
    });
  }

  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
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
      this.pending.set(id, { resolve, reject });
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
      pending.reject(new Error(SOCKET_CLOSED_MESSAGE));
    }
    this.pending.clear();
  }
}

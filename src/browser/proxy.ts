import type { Server, Socket } from "node:net";
import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpServer } from "node:http";

/** A proxy that refuses every request and records the host of each attempt. */
export interface RefusingProxy {
  /** The loopback port of the proxy. */
  port: number;
  /** The host name of each attempt, in order. */
  attempts(): string[];
  /** Stops the proxy. Resolves once no connection is open. */
  close(): Promise<void>;
}

/**
 * The host of an absolute URL, or of the authority of a CONNECT request ("host:port"). A value that is
 * neither is recorded as it was sent, so that no attempt is lost.
 */
function hostOf(target: string): string {
  if (/^https?:\/\//i.test(target)) {
    try {
      return new URL(target).hostname;
    } catch {
      // A URL that does not parse is recorded as it was sent. A throw here would crash the engine process.
      return target;
    }
  }
  const colon = target.lastIndexOf(":");
  return colon > 0 ? target.slice(0, colon) : target;
}

const REFUSED = "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";

/**
 * Starts a proxy on 127.0.0.1 with an ephemeral port. It answers 403 to each request and to each CONNECT,
 * and forwards nothing. The browser sends its connection attempts here, so the route off the host is closed.
 */
export async function startRefusingProxy(): Promise<RefusingProxy> {
  const log: string[] = [];
  const sockets = new Set<Socket>();
  const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    log.push(hostOf(req.url ?? ""));
    res.writeHead(403, { Connection: "close", "Content-Length": "0" });
    res.end();
  });
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    // The browser resets its connections while it closes. An unhandled error on a socket would end the process.
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", (req: IncomingMessage, socket: Socket) => {
    log.push(hostOf(req.url ?? ""));
    socket.on("error", () => {});
    socket.end(REFUSED);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the refusing proxy has no TCP address");
  }
  return {
    port: address.port,
    attempts: () => [...log],
    close: () => closeServer(server, sockets),
  };
}

/** Ends every open connection, then closes the server. */
function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

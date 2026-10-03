import { createServer, request } from "node:http";

/** A stoppable real origin avoids WebKit's setOffline/service-worker emulation bug. */
export async function temporaryOrigin(upstream: string, responses = new Map<string, { status: number; body: unknown }>()) {
  const server = createServer((incoming, outgoing) => {
    const response = responses.get(new URL(incoming.url ?? "/", upstream).pathname);
    if (response) {
      outgoing.writeHead(response.status, { "Content-Type": "application/json", "Cache-Control": "private, no-store" });
      outgoing.end(JSON.stringify(response.body)); return;
    }
    const forwarded = request(new URL(incoming.url ?? "/", upstream), {
      method: incoming.method ?? "GET",
      headers: incoming.headers,
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on("error", () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(forwarded);
  });

  async function start(port = 0) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  async function stop() {
    if (!server.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }

  await start();
  const address = server.address();
  if (!address || typeof address === "string") {
    await stop();
    throw new Error("Temporary origin did not expose a TCP port.");
  }

  return { url: `http://127.0.0.1:${address.port}`, stop, restart: () => start(address.port) };
}

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { parseAssetLayout, PARTY_TYPE, PROTOCOL_VERSION, RAPIER, ROOM_TYPE } from "@pumpworks/shared";
import type { HealthResponse } from "@pumpworks/shared";

import { MatchRoom, PartyMatchRoom } from "./match-room.js";

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const manifestPath = new URL("../../client/public/assets/manifest.json", import.meta.url);
const layout = parseAssetLayout(JSON.parse(await readFile(manifestPath, "utf8").catch((cause) => {
  throw new Error("Cannot read asset manifest. Run the Blender export before starting Pumpworks.", { cause });
})));
await RAPIER.init();
const httpServer = createServer();
const attempts = new Map<string, { count: number; expires: number }>();
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  express: (app) => {
    app.use("/matchmake", (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (request.method !== "POST") { next(); return; }
      const now = Date.now();
      const address = request.socket.remoteAddress ?? "unknown";
      let entry = attempts.get(address);
      if (!entry || entry.expires <= now) {
        for (const [ip, record] of attempts) if (record.expires <= now) attempts.delete(ip);
        if (attempts.size >= 4096) {
          response.writeHead(429).end();
          return;
        }
        entry = { count: 0, expires: now + 60_000 };
        attempts.set(address, entry);
      }
      if (++entry.count > 30) {
        response.writeHead(429).end();
        return;
      }
      next();
    });
    app.get("/health", (_request: IncomingMessage, response: ServerResponse) => {
      const body: HealthResponse = {
        status: "ready", protocolVersion: PROTOCOL_VERSION, assetColliderCount: layout.colliders.length,
      };
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    });
  },
});
gameServer.define(ROOM_TYPE, MatchRoom, { colliders: layout.colliders });
gameServer.define(PARTY_TYPE, PartyMatchRoom, { colliders: layout.colliders });
await gameServer.listen(port, host);
console.log(`Pumpworks server listening at http://${host}:${port}`);

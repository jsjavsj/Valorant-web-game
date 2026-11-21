import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { parseAssetLayout, PROTOCOL_VERSION, RAPIER, ROOM_TYPE } from "@pumpworks/shared";
import type { HealthResponse } from "@pumpworks/shared";

import { MatchRoom } from "./match-room.js";

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
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  express: (app) => {
    app.get("/health", (_request: IncomingMessage, response: ServerResponse) => {
      const body: HealthResponse = {
        status: "ready", protocolVersion: PROTOCOL_VERSION, assetColliderCount: layout.colliders.length,
      };
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    });
  },
});
gameServer.define(ROOM_TYPE, MatchRoom, { colliders: layout.colliders });
await gameServer.listen(port, host);
console.log(`Pumpworks server listening at http://${host}:${port}`);

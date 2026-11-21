import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Room, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import RAPIER from "@dimforge/rapier3d-compat";
import { parseAssetLayout, PROTOCOL_VERSION, ROOM_TYPE } from "@pumpworks/shared";
import type { HealthResponse } from "@pumpworks/shared";

class PrototypeRoom extends Room {
  maxClients = 2;
}

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
const assetWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
for (const { center, halfExtents } of layout.colliders) {
  assetWorld.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents).setTranslation(...center));
}

const httpServer = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }

  const body: HealthResponse = {
    status: "ready",
    protocolVersion: PROTOCOL_VERSION,
    assetColliderCount: assetWorld.colliders.len(),
  };
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_TYPE, PrototypeRoom);
await gameServer.listen(port, host);
console.log(`Pumpworks server listening at http://${host}:${port}`);

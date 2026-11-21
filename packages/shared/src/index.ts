export const GAME_NAME = "Pumpworks";
export const PROTOCOL_VERSION = 1;
export const ROOM_TYPE = "prototype";

export interface HealthResponse {
  status: "ready";
  assetColliderCount: number;
  protocolVersion: number;
}

export { parseAssetLayout } from "./assets.js";

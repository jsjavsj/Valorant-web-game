export const GAME_NAME = "Pumpworks";
export const PROTOCOL_VERSION = 1;
export const ROOM_TYPE = "prototype";

export interface HealthResponse {
  status: "ready";
  assetColliderCount: number;
  protocolVersion: number;
}

export { parseAssetLayout } from "./assets.js";

export { addArenaColliders, ARENA_BOXES, ARENA_SPAWN, CharacterMovement, MovementClock, MOVEMENT_STEP, PLAYER_CAPSULE } from "./movement.js";
export type { MoveInput } from "./movement.js";
export { default as RAPIER } from "@dimforge/rapier3d-compat";

export { IDLE_MOVE, MATCH_INPUT, MATCH_SNAPSHOT, MATCH_STOP, isOnResetPad, parsePlayerInput, PLAYER_HEALTH, RESET_PAD } from "./match.js";
export type { MatchPlayer, MatchSnapshot, PlayerInput } from "./match.js";

export { HIT_REWIND_TICKS, MATCH_FIRE, MATCH_SHOT, MATCH_RELOAD, parseAim, parseShot, SIDEARM } from "./match.js";

export { PARTY_BOT, PARTY_CODE, PARTY_READY, PARTY_SETTINGS, PARTY_START, PARTY_TYPE } from "./match.js";
export type { PartySettings, PartyState } from "./match.js";

export { PUMPWORKS_BLOCKOUT } from "./pumpworks-blockout.js";

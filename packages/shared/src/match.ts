import type { MoveInput } from "./movement.js";

export const MATCH_INPUT = "input";
export const MATCH_STOP = "stop";
export const MATCH_SNAPSHOT = "snapshot";
export const MATCH_FIRE = "fire";
export const MATCH_RELOAD = "reload";
export const SIDEARM = { damage: 25, capacity: 8, interval: 15, reloadTicks: 84, range: 30 } as const;

export function parseAim(value: unknown) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 2) return;
  const { yaw, pitch } = value as Record<string, unknown>;
  if (typeof yaw !== "number" || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI ||
      typeof pitch !== "number" || !Number.isFinite(pitch) || Math.abs(pitch) > 1.48) return;
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

export const PLAYER_HEALTH = 100;
export const IDLE_MOVE: MoveInput = {
  forward: 0, strafe: 0, yaw: 0, run: false, crouch: false, jump: false,
};

export interface PlayerInput extends MoveInput {
  seq: number;
}

export interface MatchPlayer {
  id: string;
  team: "amber" | "teal";
  x: number;
  y: number;
  z: number;
  eyeHeight: number;
  crouched: boolean;
  health: number;
  alive: boolean;
  ammo: number;
  reloading: boolean;
}

export interface MatchSnapshot {
  tick: number;
  players: MatchPlayer[];
}

export function parsePlayerInput(value: unknown): PlayerInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const { seq, forward, strafe, yaw, run, crouch, jump } = value as Record<string, unknown>;
  if (Object.keys(value).length !== 7 ||
      typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 ||
      (forward !== -1 && forward !== 0 && forward !== 1) ||
      (strafe !== -1 && strafe !== 0 && strafe !== 1) ||
      typeof yaw !== "number" || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI ||
      typeof run !== "boolean" || typeof crouch !== "boolean" || typeof jump !== "boolean") return;
  return { seq, forward, strafe, yaw, run, crouch, jump };
}

export const RESET_PAD = { x: 1.8, z: 3.65, halfWidth: 0.7, halfDepth: 0.42 };
export function isOnResetPad(feet: { x: number; y: number; z: number }) {
  return feet.y < 0.08 && Math.abs(feet.x - RESET_PAD.x) < RESET_PAD.halfWidth &&
    Math.abs(feet.z - RESET_PAD.z) < RESET_PAD.halfDepth;
}

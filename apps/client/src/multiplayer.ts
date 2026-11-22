import { Client } from "@colyseus/sdk";
import { MATCH_FIRE, MATCH_INPUT, MATCH_RELOAD, MATCH_SHOT, MATCH_SNAPSHOT, MATCH_STOP, MOVEMENT_STEP, PARTY_READY, PARTY_SETTINGS, PARTY_START, PARTY_TYPE, ROOM_TYPE } from "@pumpworks/shared";
import type { MatchPlayer, MatchSnapshot, MoveInput, PartySettings, PlayerInput } from "@pumpworks/shared";

export type MatchMode = { kind: "quick" } | { kind: "create" } | { kind: "invite"; code: string };

export async function connectMatch(mode: MatchMode, onSnapshot: (snapshot: MatchSnapshot, sessionId: string) => void, onLeave: () => void, onShot: () => void) {
  const endpoint = import.meta.env.VITE_PUMPWORKS_MATCH_URL ||
    `${window.location.protocol}//${window.location.hostname}:2567`;
  const client = new Client(endpoint);
  const room = mode.kind === "create" ? await client.create(PARTY_TYPE) :
    mode.kind === "invite" ? await client.joinById(mode.code, { code: mode.code }) :
    await client.joinOrCreate(ROOM_TYPE);

  let sequence = 0;
  let previous: MatchSnapshot | undefined;
  let latest: MatchSnapshot | undefined;
  let receivedAt = 0;
  room.onMessage(MATCH_SNAPSHOT, (snapshot: MatchSnapshot) => {
    if (latest && snapshot.tick < latest.tick) return;
    if (!latest || snapshot.tick > latest.tick) {
      previous = latest;
      receivedAt = performance.now();
    }
    latest = snapshot;
    onSnapshot(snapshot, room.sessionId);
  });
  const interpolationFraction = (ticks: number, now: number) =>
    Math.min(1, Math.max(0, (now - receivedAt) / (ticks * MOVEMENT_STEP * 1000)));

  function interpolate(player: MatchPlayer, now: number) {
    if (!previous || !latest || previous.party?.started !== latest.party?.started) return;
    const ticks = latest.tick - previous.tick;
    // Snap after a longer interruption, a respawn, or a party start.
    if (ticks <= 0 || ticks > 6) return;
    const from = previous.players.find((entry) => entry.id === player.id);
    if (!from?.alive || from.spawnTick !== player.spawnTick || from.team !== player.team) return;
    const fraction = interpolationFraction(ticks, now);
    return { from, fraction, tick: previous.tick + Math.round(ticks * fraction) };
  }
  room.onMessage(MATCH_SHOT, onShot);
  room.onLeave(onLeave);
  return {
    id: room.roomId,
    sessionId: room.sessionId,
    get snapshot() { return latest; },
    remotePosition(player: MatchPlayer, now: number) {
      const sample = interpolate(player, now);
      if (!sample) return player;
      const { from, fraction } = sample;
      return {
        x: from.x + (player.x - from.x) * fraction,
        y: from.y + (player.y - from.y) * fraction,
        z: from.z + (player.z - from.z) * fraction,
      };
    },
    send(input: MoveInput) {
      const message: PlayerInput = { ...input, seq: sequence++ };
      room.send(MATCH_INPUT, message);
      return message;
    },
    fire(yaw: number, pitch: number) {
      if (!latest) return;
      const target = latest.players.find((player) => player.id !== room.sessionId && player.alive);
      const sample = target && interpolate(target, performance.now());
      room.send(MATCH_FIRE, { yaw, pitch, viewTick: sample?.tick ?? latest.tick });
    },
    reload() {
      room.send(MATCH_RELOAD);
    },
    stop() {
      room.send(MATCH_STOP, sequence++);
    },
    ready(value: boolean) { room.send(PARTY_READY, value); },
    configure(changes: Partial<PartySettings>) { room.send(PARTY_SETTINGS, changes); },
    start() { room.send(PARTY_START); },
    async leave() { await room.leave(); },
  };
}

export type MatchConnection = Awaited<ReturnType<typeof connectMatch>>;

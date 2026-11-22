import { Client } from "@colyseus/sdk";
import { MATCH_FIRE, MATCH_INPUT, MATCH_RELOAD, MATCH_SHOT, MATCH_SNAPSHOT, MATCH_STOP, PARTY_READY, PARTY_SETTINGS, PARTY_START, PARTY_TYPE, ROOM_TYPE } from "@pumpworks/shared";
import type { MatchPlayer, MatchSnapshot, MoveInput, PartySettings, PlayerInput } from "@pumpworks/shared";

import { sampleRemotePose } from "./remote-pose";

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
  room.onMessage(MATCH_SHOT, onShot);
  room.onLeave(onLeave);
  return {
    id: room.roomId,
    sessionId: room.sessionId,
    get snapshot() { return latest; },
    remotePose(player: MatchPlayer, now: number) {
      if (latest) return sampleRemotePose(latest, previous, player, now - receivedAt);
    },
    send(input: MoveInput) {
      const message: PlayerInput = { ...input, seq: sequence++ };
      room.send(MATCH_INPUT, message);
      return message;
    },
    fire(yaw: number, pitch: number, renderedTick?: number) {
      if (!latest) return;
      room.send(MATCH_FIRE, { yaw, pitch, viewTick: renderedTick ?? latest.tick });
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

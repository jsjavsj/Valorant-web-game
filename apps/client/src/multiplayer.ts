import { Client } from "@colyseus/sdk";
import { MATCH_FIRE, MATCH_INPUT, MATCH_RELOAD, MATCH_SHOT, MATCH_SNAPSHOT, MATCH_STOP, ROOM_TYPE } from "@pumpworks/shared";
import type { MatchSnapshot, MoveInput, PlayerInput } from "@pumpworks/shared";

export async function connectMatch(onSnapshot: (snapshot: MatchSnapshot, sessionId: string) => void, onLeave: () => void, onShot: () => void) {
  const endpoint = import.meta.env.VITE_PUMPWORKS_MATCH_URL ||
    `${window.location.protocol}//${window.location.hostname}:2567`;
  const client = new Client(endpoint);
  const room = await client.joinOrCreate(ROOM_TYPE);

  let sequence = 0;
  let lastTick = -1;
  let latest: MatchSnapshot | undefined;
  room.onMessage(MATCH_SNAPSHOT, (snapshot: MatchSnapshot) => {
    if (snapshot.tick < lastTick) return;
    lastTick = snapshot.tick;
    latest = snapshot;
    onSnapshot(snapshot, room.sessionId);
  });
  room.onMessage(MATCH_SHOT, onShot);
  room.onLeave(onLeave);
  return {
    id: room.roomId,
    sessionId: room.sessionId,
    get snapshot() { return latest; },
    send(input: MoveInput) {
      const message: PlayerInput = { ...input, seq: sequence++ };
      room.send(MATCH_INPUT, message);
    },
    fire(yaw: number, pitch: number) {
      room.send(MATCH_FIRE, { yaw, pitch });
    },
    reload() {
      room.send(MATCH_RELOAD);
    },
    stop() {
      room.send(MATCH_STOP, sequence++);
    },
    async leave() { await room.leave(); },
  };
}

export type MatchConnection = Awaited<ReturnType<typeof connectMatch>>;

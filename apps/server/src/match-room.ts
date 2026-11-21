import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import {
  addArenaColliders, ARENA_SPAWN, CharacterMovement, IDLE_MOVE, isOnResetPad, MATCH_INPUT,
  MATCH_SNAPSHOT, MovementClock, MOVEMENT_STEP, parsePlayerInput, PLAYER_HEALTH, RAPIER,
} from "@pumpworks/shared";
import type { MatchPlayer, MatchSnapshot, MoveInput } from "@pumpworks/shared";

type Team = MatchPlayer["team"];
type Colliders = ReturnType<typeof import("@pumpworks/shared").parseAssetLayout>["colliders"];

interface Player {
  team: Team;
  movement: CharacterMovement;
  input: MoveInput;
  lastSeq: number;
  lastInputTick: number;
  respawnTick: number;
  lastPosition: { x: number; y: number; z: number };
}

export class MatchRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 120;
  private world!: InstanceType<typeof RAPIER.World>;
  private readonly players = new Map<string, Player>();
  private tick = 0;

  onCreate({ colliders }: { colliders: Colliders }) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = MOVEMENT_STEP;
    for (const { center, halfExtents } of colliders) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents).setTranslation(...center));
    }
    addArenaColliders(this.world);
    this.world.step();
    this.onMessage<unknown>(MATCH_INPUT, (client, payload) => {
      const player = this.players.get(client.sessionId);
      const input = parsePlayerInput(payload);
      if (!player || !input || player.respawnTick || input.seq <= player.lastSeq) return;
      player.lastSeq = input.seq;
      player.lastInputTick = this.tick;
      player.input = { ...input, jump: input.jump || player.input.jump };
    });

    const clock = new MovementClock();
    this.setSimulationInterval((elapsed) => clock.advance(elapsed / 1000, () => {
      for (const player of this.players.values()) {
        if (player.respawnTick) {
          if (this.tick >= player.respawnTick) {
            player.movement = new CharacterMovement(this.world, this.spawn(player.team));
            player.respawnTick = 0;
            player.lastInputTick = this.tick;
          }
          continue;
        }
        if (this.tick - player.lastInputTick >= 15) player.input = IDLE_MOVE;
        player.movement.step(player.input);
        const feet = player.movement.feet;
        if (isOnResetPad(feet) || feet.y < -5) {
          player.lastPosition = feet;
          player.respawnTick = this.tick + 180;
          player.movement.dispose();
          player.input = IDLE_MOVE;
        }
        if (player.input.jump) player.input = { ...player.input, jump: false };
      }
      this.world.step();
      this.tick++;
      if (this.tick % 3 === 0) this.sendSnapshot();
    }), MOVEMENT_STEP * 1000);
  }

  onJoin(client: Client) {
    const amberTaken = [...this.players.values()].some((player) => player.team === "amber");
    const team = amberTaken ? "teal" : "amber";
    const spawn = this.spawn(team);
    this.players.set(client.sessionId, {
      team, movement: new CharacterMovement(this.world, spawn),
      input: IDLE_MOVE, lastSeq: -1, lastInputTick: this.tick, respawnTick: 0, lastPosition: spawn,
    });
  }

  onLeave(client: Client) {
    const player = this.players.get(client.sessionId);
    if (player && !player.respawnTick) player.movement.dispose();
    this.players.delete(client.sessionId);
    this.sendSnapshot();
  }

  onDispose() {
    this.players.clear();
    this.world.free();
  }

  private spawn(team: Team) {
    return { ...ARENA_SPAWN, x: team === "amber" ? -1 : 1.8 };
  }

  private sendSnapshot() {
    const players = [...this.players].map(([id, { team, movement, respawnTick, lastPosition }]): MatchPlayer => ({
      id, team, ...(respawnTick ? lastPosition : movement.feet),
      eyeHeight: movement.eyeHeight, crouched: movement.crouched,
      health: respawnTick ? 0 : PLAYER_HEALTH, alive: respawnTick === 0,
    }));
    const snapshot: MatchSnapshot = { tick: this.tick, players };
    this.broadcast(MATCH_SNAPSHOT, snapshot);
  }
}

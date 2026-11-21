import { Room, ServerError } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import {
  addArenaColliders, ARENA_SPAWN, CharacterMovement, IDLE_MOVE, isOnResetPad, MATCH_INPUT,
  MATCH_FIRE, MATCH_SHOT, MATCH_RELOAD, MATCH_SNAPSHOT, MATCH_STOP, parseAim, SIDEARM, MovementClock, MOVEMENT_STEP, parsePlayerInput, PLAYER_HEALTH, RAPIER,
} from "@pumpworks/shared";
import type { MatchPlayer, MatchSnapshot, MoveInput } from "@pumpworks/shared";

type Team = MatchPlayer["team"];
type Colliders = ReturnType<typeof import("@pumpworks/shared").parseAssetLayout>["colliders"];

interface Player {
  team: Team;
  health: number;
  ammo: number;
  nextShotTick: number;
  reloadTick: number;
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

    this.onMessage<unknown>(MATCH_STOP, (client, seq) => {
      const player = this.players.get(client.sessionId);
      if (!player || typeof seq !== "number" || !Number.isSafeInteger(seq) || seq <= player.lastSeq) return;
      player.lastSeq = seq;
      player.lastInputTick = this.tick;
      player.input = IDLE_MOVE;
    });

    this.onMessage<unknown>(MATCH_FIRE, (client, payload) => {
      const shooter = this.players.get(client.sessionId);
      const direction = parseAim(payload);
      if (!shooter || !direction || shooter.respawnTick || shooter.reloadTick ||
          shooter.ammo <= 0 || this.tick < shooter.nextShotTick) return;

      shooter.ammo--;
      client.send(MATCH_SHOT);
      shooter.nextShotTick = this.tick + SIDEARM.interval;
      const hit = shooter.movement.firstHit(direction, SIDEARM.range);
      for (const target of this.players.values()) {
        if (target === shooter || target.respawnTick || target.movement.colliderHandle !== hit) continue;
        target.health = Math.max(0, target.health - SIDEARM.damage);
        if (!target.health) this.knockOut(target, target.movement.feet);
        break;
      }
    });

    this.onMessage<unknown>(MATCH_RELOAD, (client, payload) => {
      const player = this.players.get(client.sessionId);
      if (payload === undefined && player && !player.respawnTick && !player.reloadTick &&
          player.ammo < SIDEARM.capacity) {
        player.reloadTick = this.tick + SIDEARM.reloadTicks;
      }
    });

    const clock = new MovementClock();
    this.setSimulationInterval((elapsed) => clock.advance(elapsed / 1000, () => {
      for (const player of this.players.values()) {
        if (player.respawnTick) {
          if (this.tick >= player.respawnTick) {
            const spawn = this.findSpawn(player.team);
            if (!spawn) continue;
            player.movement = new CharacterMovement(this.world, spawn);
            player.respawnTick = 0;
            player.health = PLAYER_HEALTH;
            player.ammo = SIDEARM.capacity;
            player.nextShotTick = this.tick;
            player.lastInputTick = this.tick;
          }
          continue;
        }
        if (player.reloadTick && this.tick >= player.reloadTick) {
          player.reloadTick = 0;
          player.ammo = SIDEARM.capacity;
        }
        if (this.tick - player.lastInputTick >= 15) player.input = IDLE_MOVE;
        player.movement.step(player.input);
        const feet = player.movement.feet;
        if (isOnResetPad(feet) || feet.y < -5) {
          this.knockOut(player, feet);
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
    const spawn = this.findSpawn(team);
    if (!spawn) throw new ServerError(4000, "No clear spawn is available.");
    this.players.set(client.sessionId, {
      team, health: PLAYER_HEALTH, ammo: SIDEARM.capacity, nextShotTick: this.tick, reloadTick: 0,
      movement: new CharacterMovement(this.world, spawn),
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

  private findSpawn(team: Team) {
    const preferred = { ...ARENA_SPAWN, x: team === "amber" ? -1 : 1.8 };
    const occupants = [...this.players.values()]
      .filter((player) => !player.respawnTick)
      .map((player) => player.movement);
    return CharacterMovement.findSpawn(this.world, preferred, occupants);
  }

  private knockOut(player: Player, feet: Player["lastPosition"]) {
    player.health = 0;
    player.reloadTick = 0;
    player.lastPosition = feet;
    player.respawnTick = this.tick + 180;
    player.movement.dispose();
    player.input = IDLE_MOVE;
  }

  private sendSnapshot() {
    const players = [...this.players].map(([id, { team, movement, respawnTick, lastPosition, health, ammo, reloadTick }]): MatchPlayer => ({
      id, team, ...(respawnTick ? lastPosition : movement.feet),
      eyeHeight: movement.eyeHeight, crouched: movement.crouched,
      health, ammo, reloading: reloadTick !== 0, alive: respawnTick === 0,
    }));
    const snapshot: MatchSnapshot = { tick: this.tick, players };
    this.broadcast(MATCH_SNAPSHOT, snapshot);
  }
}

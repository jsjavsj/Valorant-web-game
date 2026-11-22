import { randomBytes } from "node:crypto";
import { Room, ServerError } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import {
  addArenaColliders, ARENA_SPAWN, CharacterMovement, IDLE_MOVE, isOnResetPad, MATCH_INPUT,
  PARTY_BOT, PARTY_READY, PARTY_SETTINGS, PARTY_START,
  MATCH_FIRE, MATCH_SHOT, MATCH_RELOAD, MATCH_SNAPSHOT, MATCH_STOP, parseAim, SIDEARM, MovementClock, MOVEMENT_STEP, parsePlayerInput, PLAYER_HEALTH, RAPIER,
} from "@pumpworks/shared";
import type { MatchPlayer, MatchSnapshot, MoveInput, PartySettings } from "@pumpworks/shared";

const activePartyCodes = new Set<string>();

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
  protected readonly privateParty: boolean = false;
  private inviteUntil = 0;
  private host = "";
  private readonly ready = new Set<string>();
  private started = false;
  private settings: PartySettings = { hostTeam: "amber", bot: false, allowDuplicateAgents: true };

  private get playing() {
    return !this.privateParty || this.started;
  }

  private get expired() {
    return Date.now() >= this.inviteUntil;
  }

  onAuth(_client: Client, options: { code?: unknown }) {
    if (!this.privateParty || !this.host) return true;
    if (this.started || this.expired || this.settings.bot || options?.code !== this.roomId) {
      throw new ServerError(4000, "This party is closed, full, or the code has expired.");
    }
    return true;
  }

  private configureParty() {
    let code: string;
    do { code = randomBytes(5).toString("hex").toUpperCase(); }
    while (activePartyCodes.has(code));
    activePartyCodes.add(code);
    this.roomId = code;
    this.inviteUntil = Date.now() + 30 * 60 * 1000;

    this.onMessage<unknown>(PARTY_READY, (client, value) => {
      if (this.started || this.expired || !this.players.has(client.sessionId) || typeof value !== "boolean") return;
      if (value) this.ready.add(client.sessionId);
      else this.ready.delete(client.sessionId);
    });
    this.onMessage<unknown>(PARTY_SETTINGS, (client, value) => {
      if (this.started || this.expired || client.sessionId !== this.host || !value || typeof value !== "object") return;
      const { hostTeam, bot, allowDuplicateAgents } = value as Record<string, unknown>;
      if ((hostTeam !== "amber" && hostTeam !== "teal") || typeof bot !== "boolean" ||
          typeof allowDuplicateAgents !== "boolean" || (bot && this.players.size !== 1)) return;
      this.settings = { hostTeam, bot, allowDuplicateAgents };
      this.ready.clear();
    });
    this.onMessage(PARTY_START, (client) => {
      if (this.started || this.expired || client.sessionId !== this.host ||
          (this.players.size !== 2 && !this.settings.bot) || this.ready.size !== this.players.size) return;

      // Lobby input cannot move players. Rebuild them at their configured spawns before play.
      const ids = [...this.players.keys()];
      for (const player of this.players.values()) player.movement.dispose();
      this.players.clear();
      this.world.step();
      for (const id of ids) this.spawnPlayer(id, id === this.host ? this.settings.hostTeam : this.guestTeam());
      if (this.settings.bot) this.spawnPlayer(PARTY_BOT, this.guestTeam());
      this.started = true;
      this.world.step();
    });
  }

  private guestTeam() {
    return this.settings.hostTeam === "amber" ? "teal" : "amber";
  }

  async onCreate({ colliders }: { colliders: Colliders }) {
    if (this.privateParty) {
      this.configureParty();
      await this.setPrivate(true, false);
    }
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
      if (!this.playing || !player || !input || player.respawnTick || input.seq <= player.lastSeq) return;
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
      if (!this.playing || !shooter || !direction || shooter.respawnTick || shooter.reloadTick ||
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
      if (this.playing && payload === undefined && player && !player.respawnTick && !player.reloadTick &&
          player.ammo < SIDEARM.capacity) {
        player.reloadTick = this.tick + SIDEARM.reloadTicks;
      }
    });

    const clock = new MovementClock();
    this.setSimulationInterval((elapsed) => clock.advance(elapsed / 1000, () => {
      for (const player of this.players.values()) {
        if (!this.playing) break;
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
    if (this.privateParty && this.host && (this.started || this.expired || this.settings.bot)) {
      throw new ServerError(4000, "This party is no longer accepting guests.");
    }
    this.spawnPlayer(client.sessionId, team);
    if (this.privateParty && !this.host) this.host = client.sessionId;
  }

  private spawnPlayer(id: string, team: Team) {
    const spawn = this.findSpawn(team);
    if (!spawn) throw new ServerError(4000, "No clear spawn is available.");
    this.players.set(id, {
      team, health: PLAYER_HEALTH, ammo: SIDEARM.capacity, nextShotTick: this.tick, reloadTick: 0,
      movement: new CharacterMovement(this.world, spawn),
      input: IDLE_MOVE, lastSeq: -1, lastInputTick: this.tick, respawnTick: 0, lastPosition: spawn,
    });
  }

  onLeave(client: Client) {
    const player = this.players.get(client.sessionId);
    if (player && !player.respawnTick) player.movement.dispose();
    this.players.delete(client.sessionId);
    this.ready.delete(client.sessionId);
    if (this.privateParty && client.sessionId === this.host) {
      this.host = [...this.players.keys()].find((id) => id !== PARTY_BOT) ?? "";
      this.ready.clear();
    }
    this.sendSnapshot();
  }

  onDispose() {
    if (this.privateParty) activePartyCodes.delete(this.roomId);
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
    if (this.privateParty) {
      snapshot.party = {
        code: this.roomId, host: this.host, ready: [...this.ready],
        settings: this.settings, started: this.started, expired: this.expired,
      };
    }
    this.broadcast(MATCH_SNAPSHOT, snapshot);
  }
}

export class PartyMatchRoom extends MatchRoom {
  protected override readonly privateParty = true;
}

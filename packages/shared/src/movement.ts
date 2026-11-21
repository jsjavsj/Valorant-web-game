import RAPIER from "@dimforge/rapier3d-compat";

export const MOVEMENT_STEP = 1 / 60;
const RADIUS = 0.32;
const STANDING_HEIGHT = 1.78;
const CROUCH_HEIGHT = 1.12;
const SKIN = 0.015;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
export const ARENA_SPAWN = { x: -1, y: 0.04, z: 5 };

export const ARENA_BOXES = [
  { name: "floor", center: [0, -0.15, 0], size: [14, 0.3, 14] },
  { name: "north wall", center: [0, 1.35, -7], size: [14, 2.7, 0.3] },
  { name: "south wall", center: [0, 1.35, 7], size: [14, 2.7, 0.3] },
  { name: "west wall", center: [-7, 1.35, 0], size: [0.3, 2.7, 14] },
  { name: "east wall", center: [7, 1.35, 0], size: [0.3, 2.7, 14] },
  { name: "step one", center: [-4.5, 0.09, 0.3], size: [2, 0.18, 0.8] },
  { name: "step two", center: [-4.5, 0.18, -0.5], size: [2, 0.36, 0.8] },
  { name: "step landing", center: [-4.5, 0.27, -1.6], size: [2, 0.54, 1.4] },
  { name: "ramp", center: [4.6, 0.49, 0], size: [2, 0.16, 3.6], pitch: 0.27 },
  { name: "low overhead beam", center: [2.4, 1.5, 2], size: [1.75, 0.35, 1.8] },
] as const;

export function addArenaColliders(world: RAPIER.World) {
  for (const box of ARENA_BOXES) {
    const [x, y, z] = box.size;
    const [cx, cy, cz] = box.center;
    const pitch = "pitch" in box ? box.pitch : 0;
    const rotation = { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) };
    world.createCollider(RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2)
      .setTranslation(cx, cy, cz).setRotation(rotation));
  }
}

export class MovementClock {
  private remainder = 0;

  advance(seconds: number, tick: () => void) {
    this.remainder += Math.max(0, Math.min(seconds, 0.1));
    while (this.remainder + 1e-9 >= MOVEMENT_STEP) {
      this.remainder -= MOVEMENT_STEP;
      tick();
    }
  }
}

export interface MoveInput {
  forward: number;
  strafe: number;
  yaw: number;
  run: boolean;
  crouch: boolean;
  jump: boolean;
}

export class CharacterMovement {
  static findSpawn(world: RAPIER.World, preferred: RAPIER.Vector, occupants: Iterable<CharacterMovement>) {
    const standingShape = new RAPIER.Capsule(STANDING_HEIGHT / 2 - RADIUS, RADIUS);
    const shift = 1.35;
    const offsets = [[0, 0], [0, shift], [shift, 0], [-shift, 0], [0, -shift], [shift, shift], [-shift, shift]];
    const players = [...occupants];
    for (const [dx, dz] of offsets) {
      const feet = { x: preferred.x + dx, y: preferred.y, z: preferred.z + dz };
      const center = { ...feet, y: feet.y + STANDING_HEIGHT / 2 };
      if (world.intersectionWithShape(center, IDENTITY, standingShape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)) continue;
      // A player can move or spawn between physics steps, before the query index updates.
      const overlapsPlayer = players.some((player) => {
        const other = player.feet;
        const segmentGap = Math.max(
          0,
          other.y + RADIUS - (feet.y + STANDING_HEIGHT - RADIUS),
          feet.y + RADIUS - (other.y + player.height - RADIUS),
        );
        return Math.hypot(other.x - feet.x, segmentGap, other.z - feet.z) < 2 * RADIUS + SKIN;
      });
      if (!overlapsPlayer) return feet;
    }
  }

  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly collider: RAPIER.Collider;
  private height = STANDING_HEIGHT;
  private verticalSpeed = 0;
  grounded = false;

  constructor(private readonly world: RAPIER.World, feet = ARENA_SPAWN) {
    const halfSegment = STANDING_HEIGHT / 2 - RADIUS;
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(halfSegment, RADIUS)
      .setTranslation(feet.x, feet.y + STANDING_HEIGHT / 2, feet.z));
    this.controller = world.createCharacterController(SKIN);
    this.controller.enableAutostep(0.27, 0.22, false);
    this.controller.enableSnapToGround(0.23);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.setMinSlopeSlideAngle(Math.PI / 4);
  }

  dispose() {
    this.world.removeCharacterController(this.controller);
    this.world.removeCollider(this.collider, false);
  }

  get feet() {
    const p = this.collider.translation();
    return { x: p.x, y: p.y - this.height / 2, z: p.z };
  }

  get colliderHandle() {
    return this.collider.handle;
  }

  firstHit(direction: RAPIER.Vector, range: number) {
    const feet = this.feet;
    const ray = new RAPIER.Ray({ ...feet, y: feet.y + this.eyeHeight }, direction);
    return this.world.castRay(ray, range, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider)?.collider.handle;
  }

  get eyeHeight() {
    return this.height - 0.17;
  }

  get crouched() {
    return this.height === CROUCH_HEIGHT;
  }

  private setCrouch(crouch: boolean) {
    const next = crouch ? CROUCH_HEIGHT : STANDING_HEIGHT;
    if (next === this.height) return;
    const { x, y, z } = this.feet;
    const center = { x, y: y + next / 2, z };
    const shape = new RAPIER.Capsule(next / 2 - RADIUS, RADIUS);
    if (!crouch && this.world.intersectionWithShape(
      center, IDENTITY, shape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider,
    )) return;
    this.collider.setShape(shape);
    this.collider.setTranslation(center);
    this.height = next;
  }

  step(input: MoveInput) {
    this.setCrouch(input.crouch);
    if (input.jump && this.grounded && !this.crouched) this.verticalSpeed = 4.8;
    this.verticalSpeed = Math.max(-25, this.verticalSpeed - 15 * MOVEMENT_STEP);
    const speed = this.crouched ? 1.7 : input.run ? 5.4 : 3.4;
    const scale = speed * MOVEMENT_STEP / Math.max(1, Math.hypot(input.forward, input.strafe));
    const sin = Math.sin(input.yaw);
    const cos = Math.cos(input.yaw);
    const desired = {
      x: (input.forward * sin + input.strafe * cos) * scale,
      y: this.verticalSpeed * MOVEMENT_STEP,
      z: (-input.forward * cos + input.strafe * sin) * scale,
    };
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const movement = this.controller.computedMovement();
    const position = this.collider.translation();
    this.collider.setTranslation({
      x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z,
    });
    this.grounded = this.verticalSpeed <= 0 && this.controller.computedGrounded();
    if (this.grounded || (desired.y > 0 && movement.y + 0.001 < desired.y)) {
      this.verticalSpeed = 0;
    }
  }
}

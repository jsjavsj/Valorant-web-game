import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { addArenaColliders, CharacterMovement, MovementClock, MOVEMENT_STEP } from "../dist/index.js";

await RAPIER.init();
const idle = { forward: 0, strafe: 0, yaw: 0, run: false, crouch: false, jump: false };

function arena(t, feet, addObstacle) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = MOVEMENT_STEP;
  addArenaColliders(world);
  addObstacle?.(world);
  const player = new CharacterMovement(world, feet);
  world.step();
  t.after(() => world.free());
  const tick = (input = idle) => {
    player.step(input);
    world.step();
  };
  const repeat = (count, input) => {
    for (let i = 0; i < count; i++) tick(input);
  };
  repeat(12);
  return { player, tick, repeat };
}

test("movement covers the same distance at 30, 60 and 144 rendered frames per second", (t) => {
  const positions = [30, 60, 144].map((rate) => {
    const { player, tick } = arena(t);
    const clock = new MovementClock();
    for (let frame = 0; frame < rate; frame++) {
      clock.advance(1 / rate, () => tick({ ...idle, forward: 1 }));
    }
    return player.feet.z;
  });
  assert.ok(Math.abs(positions[0] - 1.6) < 0.01);
  assert.deepEqual(positions, [positions[0], positions[0], positions[0]]);
});

test("slides along the wall and jumps only when grounded", (t) => {
  const { player, tick, repeat } = arena(t, { x: 6.4, y: 0.04, z: 5 });
  repeat(45, { ...idle, forward: 1, strafe: 1 });
  assert.ok(player.feet.x < 6.55);
  assert.ok(player.feet.z < 3.5);
  assert.ok(player.grounded);
  tick({ ...idle, jump: true });
  repeat(22);
  assert.ok(player.feet.y > 0.5);
  assert.equal(player.grounded, false);
  const before = player.feet.y;
  tick({ ...idle, jump: true });
  assert.ok(player.feet.y < before);
  repeat(50);
  assert.ok(player.grounded);
});

test("climbs the stairs and the ramp", (t) => {
  const stairs = arena(t, { x: -4.5, y: 0.04, z: 1.4 });
  stairs.repeat(47, { ...idle, forward: 1 });
  assert.ok(stairs.player.feet.y > 0.48, JSON.stringify(stairs.player.feet));
  const ramp = arena(t, { x: 4.6, y: 0.04, z: 2.1 });
  ramp.repeat(48, { ...idle, forward: 1 });
  assert.ok(ramp.player.feet.y > 0.5, JSON.stringify(ramp.player.feet));
});

test("cannot stand under a low beam and can stand again after clearing it", (t) => {
  const { player, repeat, tick } = arena(t, { x: 2.4, y: 0.04, z: 3.9 });
  repeat(25, { ...idle, forward: 1 });
  assert.ok(player.feet.z > 3.15);
  repeat(57, { ...idle, forward: 1, crouch: true });
  assert.ok(player.feet.z < 2.5);
  tick();
  assert.ok(player.crouched);
  repeat(75, { ...idle, forward: 1 });
  assert.equal(player.crouched, false);
});

test("the pump blocks a head-on approach", (t) => {
  const { player, repeat } = arena(t, undefined, (world) => {
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(-1, 0.5, 0));
  });
  repeat(120, { ...idle, forward: 1 });
  assert.ok(player.feet.z > 0.8 && player.feet.z < 0.9);
});

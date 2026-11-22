import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { addArenaColliders, CharacterMovement, IDLE_MOVE, MOVEMENT_STEP, PUMPWORKS_BLOCKOUT } from "../dist/index.js";

await RAPIER.init();
const { boxes, relay, spawns } = PUMPWORKS_BLOCKOUT;

function walkRoute(t, spawn, route) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  t.after(() => world.free());
  world.timestep = MOVEMENT_STEP;
  addArenaColliders(world, boxes);
  world.step();
  assert.deepEqual(CharacterMovement.findSpawn(world, spawn, []), spawn);
  const player = new CharacterMovement(world, spawn);
  for (const { x, z, crouch = false, minHeight } of route) {
    let reached = false;
    for (let step = 0; step < 480; step++) {
      const feet = player.feet;
      const dx = x - feet.x;
      const dz = z - feet.z;
      if (Math.hypot(dx, dz) < 0.12) {
        reached = true;
        break;
      }
      player.step({ ...IDLE_MOVE, forward: 1, yaw: Math.atan2(dx, -dz), crouch });
      world.step();
    }
    assert.ok(reached, `Could not reach (${x}, ${z}) from ${JSON.stringify(player.feet)}`);
    if (minHeight !== undefined) assert.ok(player.feet.y >= minHeight, JSON.stringify(player.feet));
  }
  assert.ok(Math.hypot(player.feet.x - relay.x, player.feet.z - relay.z) < relay.radius);
}

test("attackers reach the relay through the crouch tunnel", (t) => {
  walkRoute(t, spawns.attackers, [{ x: -5, z: 6 }, { x: -5, z: -1.75, crouch: true }, relay]);
});

test("attackers reach the relay over the maintenance catwalk", (t) => {
  walkRoute(t, spawns.attackers, [
    { x: 5, z: 6 }, { x: 5, z: -1.5, minHeight: 1.05 },
    { x: 5, z: -8.5 }, { x: 3.2, z: -8.5 }, { x: 3.2, z: -1.75 }, relay,
  ]);
});

test("defenders reach the relay from the rear corridor", (t) => {
  walkRoute(t, spawns.defenders, [
    { x: 0, z: -6 }, { x: 2.1, z: -6 }, { x: 2.1, z: -1.75 }, relay,
  ]);
});

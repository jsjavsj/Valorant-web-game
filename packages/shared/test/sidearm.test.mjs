import assert from "node:assert/strict";
import test from "node:test";
import { CharacterMovement, parseAim, RAPIER, SIDEARM } from "../dist/index.js";

await RAPIER.init();

test("first hit is the opposing capsule on a clear shot and the wall when occluded", (t) => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  t.after(() => world.free());
  const shooter = new CharacterMovement(world, { x: 0, y: 0, z: 0 });
  const target = new CharacterMovement(world, { x: 0, y: 0, z: -3 });
  const aim = parseAim({ yaw: 0, pitch: -0.12 });
  world.step();
  assert.equal(shooter.firstHit(aim, SIDEARM.range), target.colliderHandle);
  const wall = world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 0.1).setTranslation(0, 1, -1.5));
  world.step();
  assert.equal(shooter.firstHit(aim, SIDEARM.range), wall.handle);
  assert.equal(parseAim({ yaw: 0, pitch: 0, damage: 100 }), undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { CharacterMovement, parseAim, PLAYER_CAPSULE, RAPIER, SIDEARM } from "../dist/index.js";

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

test("capsule edge shots match standing and crouched silhouette dimensions", (t) => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  t.after(() => world.free());
  const target = new CharacterMovement(world, { x: 0, y: 0, z: -3 });
  world.step();
  const hit = (x, y) => world.castRay(
    new RAPIER.Ray({ x, y, z: 0 }, { x: 0, y: 0, z: -1 }), 5, true,
  )?.collider.handle;
  for (const height of [PLAYER_CAPSULE.standing, PLAYER_CAPSULE.crouched]) {
    assert.equal(hit(PLAYER_CAPSULE.radius - 0.01, height / 2), target.colliderHandle);
    assert.equal(hit(PLAYER_CAPSULE.radius + 0.01, height / 2), undefined);
    assert.equal(hit(0, height - 0.02), target.colliderHandle);
    assert.equal(hit(0, height + 0.02), undefined);
    if (height === PLAYER_CAPSULE.standing) {
      target.step({ forward: 0, strafe: 0, yaw: 0, run: false, crouch: true, jump: false });
      world.step();
    }
  }
});

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type RAPIER from "@dimforge/rapier3d-compat";
import { addArenaColliders, ARENA_BOXES, CharacterMovement, MovementClock, MOVEMENT_STEP } from "@pumpworks/shared";

const CONTROL_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Space",
]);

export function attachFirstPerson(scene: Scene, world: RAPIER.World, canvas: HTMLCanvasElement) {
  addArenaColliders(world);
  const masonry = new StandardMaterial("masonry", scene);
  masonry.diffuseColor = new Color3(0.24, 0.34, 0.38);
  const obstacles = new StandardMaterial("obstacles", scene);
  obstacles.diffuseColor = new Color3(0.62, 0.40, 0.18);
  for (const box of ARENA_BOXES) {
    const [width, height, depth] = box.size;
    const mesh = CreateBox(box.name, { width, height, depth }, scene);
    const [x, y, z] = box.center;
    mesh.position.set(x, y, z);
    mesh.rotation.x = "pitch" in box ? box.pitch : 0;
    mesh.material = box.name === "floor" || box.name.endsWith("wall") ? masonry : obstacles;
  }

  const camera = new FreeCamera("first person", Vector3.Zero(), scene);
  camera.minZ = 0.05;
  scene.activeCamera = camera;
  const movement = new CharacterMovement(world);
  const clock = new MovementClock();
  world.timestep = MOVEMENT_STEP;
  world.step();

  const keys = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  let jump = false;
  const locked = () => document.pointerLockElement === canvas;
  const clear = () => {
    keys.clear();
    jump = false;
  };

  function requestLock() {
    try {
      void canvas.requestPointerLock()?.catch(() => clear());
    } catch {
      clear();
    }
  }
  function onKeyDown(event: KeyboardEvent) {
    if (!locked() || !CONTROL_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.code === "Space" && !event.repeat) jump = true;
    keys.add(event.code);
  }
  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.code);
  }
  function onMouse(event: MouseEvent) {
    if (!locked()) return;
    yaw += event.movementX * 0.002;
    pitch = Math.max(-1.48, Math.min(1.48, pitch - event.movementY * 0.002));
  }

  canvas.addEventListener("click", requestLock);
  document.addEventListener("pointerlockchange", clear);
  document.addEventListener("visibilitychange", clear);
  window.addEventListener("blur", clear);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouse);

  const update = (seconds: number) => {
    clock.advance(seconds, () => {
      movement.step({
        forward: Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
        strafe: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        yaw,
        run: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: keys.has("ControlLeft") || keys.has("ControlRight"),
        jump,
      });
      jump = false;
      world.step();
    });
    const { x, y, z } = movement.feet;
    camera.position.set(x, y + movement.eyeHeight, z);
    const aim = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.setTarget(camera.position.add(aim));
    canvas.dataset.playerPosition = [x, y, z].map((value) => value.toFixed(3)).join(",");
  };
  update(0);
  return {
    update,
    dispose() {
      canvas.removeEventListener("click", requestLock);
      document.removeEventListener("pointerlockchange", clear);
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("blur", clear);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouse);
      if (locked()) document.exitPointerLock();
    },
  };
}

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { MatchConnection } from "./multiplayer";
import type RAPIER from "@dimforge/rapier3d-compat";
import { addArenaColliders, ARENA_BOXES, CharacterMovement, MovementClock, MOVEMENT_STEP, PLAYER_CAPSULE, RESET_PAD, SIDEARM } from "@pumpworks/shared";

const CONTROL_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Space",
]);

export function attachFirstPerson(scene: Scene, world: RAPIER.World, canvas: HTMLCanvasElement, getRoom: () => MatchConnection | null) {
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
    getRoom()?.stop();
  };

  function requestLock() {
    try {
      void canvas.requestPointerLock()?.catch(() => clear());
    } catch {
      clear();
    }
  }
  function onKeyDown(event: KeyboardEvent) {
    if (!locked()) return;
    if (event.code === "KeyR" && !event.repeat) getRoom()?.reload();
    if (!CONTROL_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.code === "Space" && !event.repeat) jump = true;
    keys.add(event.code);
  }
  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.code);
  }
  function onLockChange() {
    if (!locked()) clear();
  }
  function onVisibilityChange() {
    if (document.hidden) clear();
  }
  function onMouse(event: MouseEvent) {
    if (!locked()) return;
    yaw += event.movementX * 0.002;
    pitch = Math.max(-1.48, Math.min(1.48, pitch - event.movementY * 0.002));
  }

  let nextLocalShot = 0;
  function onFire(event: MouseEvent) {
    if (event.button !== 0 || !locked()) return;
    const room = getRoom();
    const player = room?.snapshot?.players.find((entry) => entry.id === room.sessionId);
    if (!room || !player?.alive || !player.ammo || player.reloading) return;
    const now = performance.now();
    if (now < nextLocalShot) return;
    nextLocalShot = now + SIDEARM.interval * MOVEMENT_STEP * 1000;
    room.fire(Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch);
  }
  canvas.addEventListener("mousedown", onFire);
  canvas.addEventListener("click", requestLock);
  document.addEventListener("pointerlockchange", onLockChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", clear);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouse);

  const marker = CreateBox("reset pad", {
    width: RESET_PAD.halfWidth * 2, height: 0.012, depth: RESET_PAD.halfDepth * 2,
  }, scene);
  marker.position.set(RESET_PAD.x, 0.006, RESET_PAD.z);
  const markerMaterial = new StandardMaterial("reset pad paint", scene);
  markerMaterial.diffuseColor = new Color3(0.75, 0.10, 0.20);
  marker.material = markerMaterial;
  marker.setEnabled(false);

  const avatars = new Map<string, { mesh: ReturnType<typeof CreateCapsule>; height: number }>();
  const teamColors = {
    amber: new Color3(0.92, 0.57, 0.18),
    teal: new Color3(0.19, 0.74, 0.70),
  };
  const teamMaterials = {
    amber: new StandardMaterial("amber team", scene),
    teal: new StandardMaterial("teal team", scene),
  };
  teamMaterials.amber.diffuseColor = teamColors.amber;
  teamMaterials.teal.diffuseColor = teamColors.teal;

  const update = (seconds: number) => {
    const room = getRoom();
    marker.setEnabled(Boolean(room));
    clock.advance(seconds, () => {
      const input = {
        forward: Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
        strafe: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
        run: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: keys.has("ControlLeft") || keys.has("ControlRight"),
        jump,
      };
      jump = false;
      if (room) room.send(input);
      else {
        movement.step(input);
        world.step();
      }
    });
    const players = room?.snapshot?.players ?? [];
    const self = players.find((player) => player.id === room?.sessionId);
    const remote = players.filter((player) => player.id !== room?.sessionId && player.alive);
    for (const [id, { mesh }] of avatars) {
      if (!remote.some((player) => player.id === id)) {
        mesh.dispose();
        avatars.delete(id);
      }
    }
    for (const player of remote) {
      const height = player.crouched ? PLAYER_CAPSULE.crouched : PLAYER_CAPSULE.standing;
      let avatar = avatars.get(player.id);
      if (avatar?.height !== height) {
        avatar?.mesh.dispose();
        const mesh = CreateCapsule("remote player", {
          height, radius: PLAYER_CAPSULE.radius, tessellation: 32, capSubdivisions: 12,
        }, scene);
        mesh.material = teamMaterials[player.team];
        avatar = { mesh, height };
        avatars.set(player.id, avatar);
      }
      avatar.mesh.position.set(player.x, player.y + height / 2, player.z);
    }
    canvas.dataset.roomId = room?.id ?? "";
    const { x, y, z } = self ?? movement.feet;
    camera.position.set(x, y + (self?.eyeHeight ?? movement.eyeHeight), z);
    const aim = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.setTarget(camera.position.add(aim));
    canvas.dataset.playerPosition = [x, y, z].map((value) => value.toFixed(3)).join(",");
  };
  update(0);
  return {
    update,
    dispose() {
      canvas.removeEventListener("mousedown", onFire);
      canvas.removeEventListener("click", requestLock);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", clear);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouse);
      if (locked()) document.exitPointerLock();
    },
  };
}

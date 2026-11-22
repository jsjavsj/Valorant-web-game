import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { PUMPWORKS_BLOCKOUT } from "@pumpworks/shared";

type Dimensions = readonly [number, number, number];

export function buildCourtyard(scene: Scene) {
  scene.clearColor = new Color4(0.68, 0.79, 0.85, 1);
  scene.ambientColor = new Color3(0.45, 0.42, 0.38);
  const sky = new HemisphericLight("courtyard skylight", Vector3.Up(), scene);
  sky.intensity = 0.68;
  sky.groundColor = new Color3(0.46, 0.45, 0.49);
  const sun = new DirectionalLight("afternoon sun", new Vector3(0.55, -1, -0.4), scene);
  sun.position.set(-14, 24, 12);
  sun.diffuse = new Color3(1, 0.89, 0.71);
  sun.intensity = 1;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.001;

  function material(name: string, color: string) {
    const result = new StandardMaterial(name, scene);
    result.diffuseColor = Color3.FromHexString(color);
    result.specularColor = new Color3(0.08, 0.08, 0.08);
    return result;
  }

  const plaster = material("aged sandstone plaster", "#cfaa8b");
  const limestone = material("dressed limestone", "#dfc6a5");
  const brick = material("terracotta", "#a25943");
  const timber = material("dark weathered timber", "#58473e");
  const iron = material("painted sluice iron", "#366466");
  const grass = material("courtyard moss", "#54694f");
  const water = material("spillway water", "#387b83");
  water.specularColor = new Color3(0.32, 0.38, 0.4);
  const paving = material("courtyard flagstones", "#a9a49b");
  const texture = new DynamicTexture("flagstone surface", { width: 1024, height: 1024 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#46433e";
  ctx.fillRect(0, 0, 1024, 1024);
  const shades = ["#9c978b", "#858075", "#91867a", "#aaa295", "#777a75"];
  for (let row = 0; row < 32; row++) {
    for (let col = -1; col < 32; col++) {
      const shade = ((col + 1) * 17 + row * 31 + row * col * 7) % shades.length;
      ctx.fillStyle = shades[Math.abs(shade)];
      ctx.fillRect(col * 32 + (row % 2) * 16 + 1, row * 32 + 1, 30, 30);
    }
  }
  texture.update();
  paving.diffuseTexture = texture;

  function box(name: string, center: Dimensions, size: Dimensions, surface: StandardMaterial, castsShadow = true) {
    const [width, height, depth] = size;
    const mesh = CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(...center);
    mesh.material = surface;
    mesh.receiveShadows = true;
    if (castsShadow) shadows.addShadowCaster(mesh);
    return mesh;
  }

  for (const piece of PUMPWORKS_BLOCKOUT.boxes) {
    const floor = piece.name === "station floor";
    const maintenance = piece.name.includes("maintenance");
    const surface = floor ? paving : maintenance ? limestone : piece.name === "pump bank" ? iron : plaster;
    box(piece.name, piece.center, piece.size, surface, !floor);
  }

  // Facades and relief outside the playable perimeter leave the shared collision geometry intact.
  for (const z of [-12.6, -8.6, -4.6, -0.6, 3.4, 7.4, 11.4]) {
    box("east facade", [12.6, 2.9, z], [3, 5.8, 3.85], plaster);
    box("terra-cotta coping", [12.5, 5.92, z], [3.25, 0.24, 3.95], brick);
    box("east window recess", [11.08, 4.05, z], [0.05, 1.22, 0.88], timber);
    box("east window sill", [10.99, 3.42, z], [0.34, 0.12, 1.08], limestone);
  }
  for (const x of [-8.7, -4.35, 0, 4.35, 8.7]) {
    box("north gatehouse facade", [x, 2.4, -13.2], [4.18, 4.8, 2.15], plaster);
    box("north tile roof", [x, 4.91, -13.2], [4.25, 0.27, 2.34], brick);
  }
  for (const z of [-8.6, -0.6, 7.4]) {
    for (const side of [-1, 1]) {
      box("arcade jamb", [10.79, 0.78, z + side * 0.84], [0.17, 1.56, 0.2], limestone);
    }
    for (let segment = 0; segment <= 8; segment++) {
      const angle = segment * Math.PI / 8;
      const stone = box("arcade arch stone", [10.79, 1.53 + Math.sin(angle) * 0.84, z + Math.cos(angle) * 0.84],
        [0.17, 0.21, 0.34], limestone);
      stone.rotation.x = -angle;
    }
  }
  for (const z of [-8, -3, 2, 7]) {
    box("yard limestone pier", [-10.88, 1.6, z], [0.21, 3.2, 0.42], limestone);
  }
  box("spillway", [-13.1, -0.34, 0], [4.1, 0.08, 25], water, false);
  box("far spillway retaining wall", [-15.4, 0.2, 0], [0.45, 1.1, 25], limestone);
  box("moss along west wall", [-10.38, 0.005, -3], [0.54, 0.01, 9], grass, false);
  box("moss along east wall", [10.38, 0.005, 4], [0.54, 0.01, 9], grass, false);

  const { x, z, radius } = PUMPWORKS_BLOCKOUT.relay;
  const ring = CreateTorus("relay inlay", { diameter: radius * 2, thickness: 0.055, tessellation: 40 }, scene);
  ring.position.set(x, 0.022, z);
  ring.material = iron;
  ring.receiveShadows = true;
  for (const offset of [-0.9, 0, 0.9]) {
    const wheel = CreateTorus("sluice valve wheel", { diameter: 0.52, thickness: 0.055, tessellation: 16 }, scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(offset, 1.08, -3.83);
    wheel.material = brick;
    shadows.addShadowCaster(wheel);
  }
}

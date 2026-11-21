import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import RAPIER from "@dimforge/rapier3d-compat";
import { GAME_NAME, parseAssetLayout, PROTOCOL_VERSION } from "@pumpworks/shared";
import type { HealthResponse } from "@pumpworks/shared";

function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [graphics, setGraphics] = useState("Starting graphics and physics…");
  const [server, setServer] = useState("Checking game server…");

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    let disposed = false;
    let engine: Engine | undefined;
    let assetWorld: RAPIER.World | undefined;
    const controller = new AbortController();
    const resize = () => engine?.resize();

    async function start(target: HTMLCanvasElement) {
      const response = await fetch("/assets/manifest.json", { signal: controller.signal });
      if (!response.ok) throw new Error("Asset manifest could not be loaded");
      const layout = parseAssetLayout(await response.json());
      await RAPIER.init();
      if (disposed) return;

      engine = new Engine(target, true);
      const scene = new Scene(engine);
      scene.useRightHandedSystem = true;
      new ArcRotateCamera("preview", -Math.PI / 2, Math.PI / 3, 5, new Vector3(0, 0.8, 0), scene);
      new HemisphericLight("sky", Vector3.Up(), scene);
      assetWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      for (const { center, halfExtents } of layout.colliders) {
        assetWorld.createCollider(RAPIER.ColliderDesc.cuboid(...halfExtents).setTranslation(...center));
      }

      const prop = await SceneLoader.ImportMeshAsync("", "/assets/", layout.prop, scene);
      if (disposed) return;
      const character = await SceneLoader.ImportMeshAsync("", "/assets/", layout.character, scene);
      if (disposed) return;
      const body = character.meshes.find((mesh) => mesh.skeleton);
      const clip = character.animationGroups.find((animation) => animation.name === "Idle");
      const root = body?.skeleton?.bones.find((bone) => bone.name === "root")?.getTransformNode();
      const housing = prop.meshes.find((mesh) => mesh.getTotalVertices() > 0);
      if (!body || !clip || !housing || !root?.rotationQuaternion) throw new Error("The preview assets are incomplete");
      housing.computeWorldMatrix(true);
      const bounds = housing.getBoundingInfo().boundingBox;
      const collider = layout.colliders[0];
      if (Vector3.Distance(bounds.centerWorld, Vector3.FromArray(collider.center)) > 0.001 ||
          Vector3.Distance(bounds.extendSizeWorld, Vector3.FromArray(collider.halfExtents)) > 0.001) {
        throw new Error("Pump housing scale or position does not match its collider");
      }
      body.computeWorldMatrix(true);
      const droneDimensions = body.getBoundingInfo().boundingBox.extendSizeWorld.scale(2);
      target.dataset.characterDimensions = droneDimensions.asArray().join(",");
      clip.stop();
      clip.start(true);
      await scene.whenReadyAsync();
      if (disposed) return;

      scene.render();
      const initialPose = root.rotationQuaternion.clone();
      const checkMotion = scene.onAfterRenderObservable.add(() => {
        const rotation = root.rotationQuaternion;
        if (rotation && 1 - Math.abs(Quaternion.Dot(initialPose, rotation)) > 0.0001) {
          target.dataset.characterMoved = "true";
          scene.onAfterRenderObservable.remove(checkMotion);
        }
      });
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", resize);
      setGraphics("Graphics and physics ready");
      target.dataset.assetColliderCount = String(assetWorld.colliders.len());
      target.dataset.characterAnimation = clip.name;
    }

    void start(element).catch((error: unknown) => {
      engine?.dispose();
      engine = undefined;
      assetWorld?.free();
      assetWorld = undefined;
      if (!disposed) {
        console.error("Preview initialization failed", error);
        setGraphics("Preview assets could not load. Run the Blender export and reload.");
      }
    });

    return () => {
      disposed = true;
      controller.abort();
      assetWorld?.free();
      assetWorld = undefined;
      window.removeEventListener("resize", resize);
      engine?.dispose();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function checkServer() {
      const response = await fetch("/health", { signal: controller.signal });
      if (!response.ok) throw new Error("Health check failed");
      const health: HealthResponse = await response.json();
      setServer(health.status === "ready" && health.protocolVersion === PROTOCOL_VERSION
        ? "Game server ready"
        : "Game server protocol mismatch");
    }

    void checkServer().catch(() => {
      if (!controller.signal.aborted) setServer("Game server unavailable");
    });
    return () => controller.abort();
  }, []);

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui" }}>
      <h1>{GAME_NAME}</h1>
      <p role="status">{server}</p>
      <p role="status">{graphics}</p>
      <canvas ref={canvas} aria-label="3D scene preview" style={{ width: "100%", height: 360 }} />
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<App />);

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Scene } from "@babylonjs/core/scene";
import RAPIER from "@dimforge/rapier3d-compat";
import { GAME_NAME, PROTOCOL_VERSION } from "@pumpworks/shared";
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
    const resize = () => engine?.resize();

    async function start(target: HTMLCanvasElement) {
      await RAPIER.init();
      if (disposed) return;

      engine = new Engine(target, true);
      const scene = new Scene(engine);
      new ArcRotateCamera("preview", -Math.PI / 2, Math.PI / 3, 5, Vector3.Zero(), scene);
      new HemisphericLight("sky", Vector3.Up(), scene);
      const box = CreateBox("placeholder", { size: 1 }, scene);
      box.material = new StandardMaterial("preview material", scene);
      await scene.whenReadyAsync();
      if (disposed) return;

      scene.render();
      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", resize);
      setGraphics("Graphics and physics ready");
    }

    void start(element).catch(() => {
      engine?.dispose();
      engine = undefined;
      if (!disposed) setGraphics("Graphics or physics could not start");
    });

    return () => {
      disposed = true;
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

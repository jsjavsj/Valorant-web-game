import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { GAME_NAME, parseAssetLayout, PROTOCOL_VERSION, RAPIER } from "@pumpworks/shared";
import type { HealthResponse, PartyState } from "@pumpworks/shared";
import { PARTY_CODE } from "@pumpworks/shared";
import { connectMatch } from "./multiplayer";
import type { MatchConnection, MatchMode } from "./multiplayer";
import { attachFirstPerson } from "./first-person";

const courtyard = new URLSearchParams(window.location.search).get("map") === "courtyard";

function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const network = useRef<MatchConnection | null>(null);
  const controlsRef = useRef<ReturnType<typeof attachFirstPerson> | undefined>(undefined);
  const [overview, setOverview] = useState(false);
  const [party, setParty] = useState<PartyState>();
  const [invite, setInvite] = useState("");
  const [privateMatch, setPrivateMatch] = useState(false);
  const [connection, setConnection] = useState<"offline" | "joining" | "online" | "leaving">("offline");
  const [health, setHealth] = useState(100);
  const [weapon, setWeapon] = useState({ ammo: 8, reloading: false });
  const [players, setPlayers] = useState(0);
  const [matchError, setMatchError] = useState("");
  const [graphics, setGraphics] = useState("Starting graphics and physics…");
  const [server, setServer] = useState("Checking game server…");

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    let disposed = false;
    let engine: Engine | undefined;
    let assetWorld: InstanceType<typeof RAPIER.World> | undefined;
    let controls: ReturnType<typeof attachFirstPerson> | undefined;
    const controller = new AbortController();
    const resize = () => engine?.resize();

    async function start(target: HTMLCanvasElement) {
      if (courtyard) {
        await RAPIER.init();
        if (disposed) return;
        const renderer = engine = new Engine(target, true);
        const scene = new Scene(renderer);
        scene.useRightHandedSystem = true;
        assetWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        const movement = controls = attachFirstPerson(scene, assetWorld, target, () => null, true);
        controlsRef.current = movement;
        await scene.whenReadyAsync();
        if (disposed) return;
        renderer.runRenderLoop(() => {
          movement.update(renderer.getDeltaTime() / 1000);
          scene.render();
        });
        window.addEventListener("resize", resize);
        setGraphics("Graphics and physics ready");
        return;
      }

      const response = await fetch("/assets/manifest.json", { signal: controller.signal });
      if (!response.ok) throw new Error("Asset manifest could not be loaded");
      const layout = parseAssetLayout(await response.json());
      await RAPIER.init();
      if (disposed) return;

      engine = new Engine(target, true);
      const scene = new Scene(engine);
      scene.useRightHandedSystem = true;
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
      target.dataset.assetColliderCount = String(assetWorld.colliders.len());
      controls = attachFirstPerson(scene, assetWorld, target, () => network.current);
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
      const movement = controls;
      const renderer = engine;
      renderer.runRenderLoop(() => {
        movement.update(renderer.getDeltaTime() / 1000);
        scene.render();
      });
      window.addEventListener("resize", resize);
      setGraphics("Graphics and physics ready");
      target.dataset.characterAnimation = clip.name;
    }

    void start(element).catch((error: unknown) => {
      controls?.dispose();
      controls = undefined;
      engine?.dispose();
      engine = undefined;
      assetWorld?.free();
      assetWorld = undefined;
      if (!disposed) {
        console.error("Preview initialization failed", error);
        setGraphics(courtyard ? "Courtyard preview could not load." : "Preview assets could not load. Run the Blender export and reload.");
      }
    });

    return () => {
      disposed = true;
      controller.abort();
      controlsRef.current = undefined;
      controls?.dispose();
      assetWorld?.free();
      assetWorld = undefined;
      window.removeEventListener("resize", resize);
      engine?.dispose();
    };
  }, []);

  useEffect(() => {
    if (courtyard) return;
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

  async function toggleMatch(mode: MatchMode = { kind: "quick" }) {
    if (network.current) {
      setConnection("leaving");
      try { await network.current.leave(); }
      catch { setMatchError("The connection already closed."); }
      finally {
        network.current = null;
        setPlayers(0);
        setParty(undefined);
        setConnection("offline");
      }
      return;
    }
    setPrivateMatch(mode.kind !== "quick");
    setConnection("joining");
    setMatchError("");
    try {
      network.current = await connectMatch(
        mode,
        (snapshot, sessionId) => {
          setPlayers(snapshot.players.length);
          setParty(snapshot.party);
          const self = snapshot.players.find((player) => player.id === sessionId);
          if (self) {
            setHealth(self.health);
            setWeapon({ ammo: self.ammo, reloading: self.reloading });
          }
          const other = snapshot.players.find((player) => player.id !== sessionId);
          const target = canvas.current;
          if (target) {
            target.dataset.remoteAlive = other?.alive.toString() ?? "";
            target.dataset.remotePosition = other?.alive ?
              [other.x, other.y, other.z].map((value) => value.toFixed(3)).join(",") : "";
          }
        },
        () => {
          network.current = null;
          setPlayers(0);
          setParty(undefined);
          setConnection("offline");
        },
        () => canvas.current?.animate([{ opacity: 0.8 }, { opacity: 1 }], 95),
      );
      setConnection("online");
    } catch {
      setMatchError(mode.kind === "invite" ? "Could not join. Check that the code is valid and the party is open." : "Unable to reach the match server. Try again.");
      setParty(undefined);
      setConnection("offline");
    }
  }

  const online = connection === "online";
  const playing = online && (!privateMatch || party?.started);
  const waiting = online && party && !party.started;
  const sessionId = network.current?.sessionId;
  const host = sessionId === party?.host;
  const ready = Boolean(sessionId && party?.ready.includes(sessionId));

  if (courtyard) return (
    <main style={{ maxWidth: 1120, margin: "1.5rem auto", padding: "0 1rem", fontFamily: "system-ui" }}>
      <nav><a href="./">Back to Pumpworks</a></nav>
      <h1>Floodgate Courtyard</h1>
      <p role="status">{graphics}</p>
      <button type="button" disabled={graphics !== "Graphics and physics ready"} aria-pressed={overview}
        onClick={() => {
          controlsRef.current?.setOverview(!overview);
          setOverview(!overview);
        }}>Overhead view</button>
      <p>Click the courtyard to look around. WASD moves, Ctrl crouches, and Esc releases the mouse.</p>
      <canvas ref={canvas} aria-label="Floodgate Courtyard preview"
        style={{ width: "100%", height: "min(65vh, 720px)", display: "block" }} />
    </main>
  );

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui" }}>
      <h1>{GAME_NAME}</h1>
      <p><a href="?map=courtyard">Explore Floodgate Courtyard</a></p>
      <p role="status">{server}</p>
      <p role="status">{graphics}</p>
      <button type="button" disabled={connection === "joining" || connection === "leaving"}
        onClick={() => void toggleMatch()}>
        {connection === "online" ? "Leave match" : connection === "joining" ? "Joining…" : "Join match"}
      </button>
      {connection === "offline" && <>
        <button type="button" onClick={() => void toggleMatch({ kind: "create" })}>Create private party</button>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (PARTY_CODE.test(invite)) void toggleMatch({ kind: "invite", code: invite });
        }}>
          <label>Party code <input value={invite} maxLength={10} autoComplete="off"
            onChange={(event) => setInvite(event.target.value.trim().toUpperCase())} /></label>
          <button type="submit" disabled={!PARTY_CODE.test(invite)}>Join by code</button>
        </form>
      </>}
      {waiting && <section aria-label="Private party">
        <p>Party code: <output aria-label="Invite code">{party.code}</output></p>
        <p>{players}/2 players · {party.ready.length}/{players} ready</p>
        {party.expired && <p role="status">Party code expired. Create a new party to play.</p>}
        <p>Host: {party.settings.hostTeam} · Guest: {party.settings.hostTeam === "amber" ? "teal" : "amber"}</p>
        {host && <fieldset disabled={party.expired}>
          <legend>Host settings</legend>
          <label>Host team <select value={party.settings.hostTeam}
            onChange={(event) => network.current?.configure({
              hostTeam: event.target.value === "teal" ? "teal" : "amber",
            })}>
            <option value="amber">Amber</option>
            <option value="teal">Teal</option>
          </select></label>
          <label><input type="checkbox" checked={party.settings.bot} disabled={players > 1}
            onChange={(event) => network.current?.configure({ bot: event.target.checked })} />
            Add stationary training bot</label>
          <label><input type="checkbox" checked={party.settings.allowDuplicateAgents}
            onChange={(event) => network.current?.configure({ allowDuplicateAgents: event.target.checked })} />
            Allow duplicate agents</label>
          <button type="button" disabled={(!party.settings.bot && players !== 2) || party.ready.length !== players}
            onClick={() => network.current?.start()}>Start match</button>
        </fieldset>}
        <button type="button" disabled={party.expired} onClick={() => network.current?.ready(!ready)}>
          {ready ? "Not ready" : "Ready"}
        </button>
      </section>}
      {playing && <>
        <p role="status">{party?.settings.bot ? "Solo match · Training bot active" : `${players}/2 players connected`}</p>
        <p role="status">{health === 0 ? "Respawning…" : `Health: ${health}`}</p>
        <p role="status">{weapon.reloading ? "Reloading…" : `Practice sidearm: ${weapon.ammo} rounds`}</p>
        <p>Left click to fire · R to reload</p>
      </>}
      {matchError && <p role="alert">{matchError}</p>}
      <p>Click the arena to look around. WASD to move, Shift to run, Ctrl to crouch, Space to jump, and Esc to release the mouse.</p>
      <div style={{ position: "relative" }}>
        <canvas ref={canvas} aria-label="3D scene preview" style={{ width: "100%", height: 360, display: "block" }} />
        {playing && <span aria-hidden="true" style={{
          pointerEvents: "none", position: "absolute", left: "50%", top: "50%",
          color: "white", transform: "translate(-50%, -50%)",
        }}>+</span>}
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<App />);

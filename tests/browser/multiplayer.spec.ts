import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

test("two browsers share server positions and a departing player is removed", async ({ browser }) => {
  test.setTimeout(60_000);
  const left = await browser.newPage();
  const right = await browser.newPage();
  const sent: (string | Buffer)[] = [];
  let releaseMovement: (() => void) | undefined;
  const movementGate = new Promise<void>((resolve) => { releaseMovement = resolve; });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let deliveryTime = 0;
  let frameNumber = 0;
  await left.routeWebSocket(/:2567\//, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (!Buffer.isBuffer(message) || !message.includes("input")) {
        server.send(message);
        return;
      }
      void movementGate.then(() => {
        if (left.isClosed()) return;
        const now = Date.now();
        deliveryTime = Math.max(deliveryTime + 1, now + 70 + (frameNumber++ % 3) * 15);
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!left.isClosed()) server.send(message);
        }, deliveryTime - now);
        timers.add(timer);
      });
    });
  });
  left.on("websocket", (socket) => socket.on("framesent", ({ payload }) => sent.push(payload)));
  try {
    await left.addInitScript(() => {
      const schedule = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => schedule((time) => {
        if (document.documentElement.dataset.pauseFrames !== "true") callback(time);
      });
    });
    await left.goto("/");
    await right.goto("/");
    for (const page of [left, right]) {
      await expect(page.getByText("Graphics and physics ready", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Join match" }).click();
    }
    const first = left.getByLabel("3D scene preview");
    const second = right.getByLabel("3D scene preview");
    await expect(left.getByText("2/2 players connected")).toBeVisible({ timeout: 10_000 });
    await expect(right.getByText("2/2 players connected")).toBeVisible();
    const roomId = await first.getAttribute("data-room-id");
    expect(roomId).toBeTruthy();
    await expect(second).toHaveAttribute("data-room-id", roomId!);

    const readRemotePosition = async () =>
      (await second.getAttribute("data-remote-position"))?.split(",").map(Number) ?? [];
    await expect.poll(async () => (await readRemotePosition()).length).toBe(3);
    const [x, , z] = await readRemotePosition();
    await left.bringToFront();
    await first.hover();
    await left.mouse.down();
    await left.mouse.up();
    await expect.poll(() => left.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await first.evaluate((canvas) => {
      let maxCorrection = 0;
      new MutationObserver(() => {
        maxCorrection = Math.max(maxCorrection, Number(canvas.getAttribute("data-prediction-error")));
        canvas.setAttribute("data-test-max-correction", String(maxCorrection));
      }).observe(canvas, { attributes: true, attributeFilter: ["data-prediction-error"] });
    });
    const localZ = Number((await first.getAttribute("data-player-position"))!.split(",")[2]);
    await left.keyboard.down("w");
    await expect.poll(async () => {
      const position = await first.getAttribute("data-player-position");
      return localZ - Number(position?.split(",")[2]);
    }).toBeGreaterThan(0.08);
    const [unmovedX, , unmovedZ] = await readRemotePosition();
    expect(Math.hypot(unmovedX - x, unmovedZ - z)).toBeLessThan(0.01);
    releaseMovement?.();
    await expect(first).toHaveAttribute("data-prediction-error", /^\d+\.\d+$/);
    await expect.poll(async () => {
      const [nowX, , nowZ] = await readRemotePosition();
      return Math.hypot(nowX - x, nowZ - z);
    }, { timeout: 15_000 }).toBeGreaterThan(0.3);
    const beforeBlur = sent.length;
    await left.evaluate(() => {
      document.documentElement.dataset.pauseFrames = "true";
      window.dispatchEvent(new Event("blur"));
    });
    await expect.poll(() => sent.slice(beforeBlur).some((frame) =>
      Buffer.isBuffer(frame) && frame.includes("stop"),
    )).toBe(true);
    await left.keyboard.up("w");
    await left.evaluate(() => document.exitPointerLock());
    await expect.poll(() => left.evaluate(() => document.pointerLockElement === null)).toBe(true);
    await left.evaluate(() => { delete document.documentElement.dataset.pauseFrames; });
    await expect.poll(async () => {
      const local = (await first.getAttribute("data-player-position"))?.split(",").map(Number) ?? [];
      const remote = await readRemotePosition();
      return Math.hypot(local[0] - remote[0], local[2] - remote[2]);
    }).toBeLessThan(0.15);
    console.log(`Prediction under 70–100 ms input jitter: max correction ${await first.getAttribute("data-test-max-correction")} m`);

    await left.getByRole("button", { name: "Leave match" }).click();
    await expect(right.getByText("1/2 players connected")).toBeVisible();
    await expect(second).toHaveAttribute("data-remote-position", "");
  } finally {
    await Promise.all([left.close(), right.close()]);
    releaseMovement?.();
    for (const timer of timers) clearTimeout(timer);
  }
});

test("the server synchronizes a reset pad knockout and respawn", async () => {
  const requireClient = createRequire(new URL("../../apps/client/package.json", import.meta.url));
  const { Client } = requireClient("@colyseus/sdk") as typeof import("../../apps/client/node_modules/@colyseus/sdk");
  const client = new Client("http://127.0.0.1:2567");
  const amber = await client.create("prototype");
  type Snapshot = { players: { id: string; health: number; alive: boolean; lastAppliedInputSeq: number }[] };
  let observer: Snapshot | undefined;
  amber.onMessage("snapshot", (value: Snapshot) => { observer = value; });
  const teal = await client.joinById(amber.roomId);
  let own: Snapshot | undefined;
  teal.onMessage("snapshot", (value: Snapshot) => { own = value; });
  const read = () => observer?.players.find((player) => player.id === teal.sessionId);
  const self = () => own?.players.find((player) => player.id === teal.sessionId);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await expect.poll(() => read()?.health).toBe(100);
    expect(self()?.lastAppliedInputSeq ?? -1).toBe(-1);
    teal.send("input", { seq: 0, forward: 0, strafe: 0, yaw: 0, run: false, crouch: false, jump: false });
    await expect.poll(() => self()?.lastAppliedInputSeq).toBe(0);
    teal.send("stop", 1);
    await expect.poll(() => self()?.lastAppliedInputSeq).toBe(1);

    let seq = 2;
    timer = setInterval(() => {
      teal.send("input", { seq: seq++, forward: 1, strafe: 0, yaw: 0, run: false, crouch: false, jump: false });
    }, 30);
    await expect.poll(() => read()?.health).toBe(0);
    clearInterval(timer);
    await expect.poll(() => self()?.alive).toBe(false);
    await expect.poll(() => read()?.health, { timeout: 8_000 }).toBe(100);
    await expect.poll(() => self()?.alive).toBe(true);
  } finally {
    clearInterval(timer);
    await Promise.all([amber.leave(), teal.leave()]);
  }
});

test("the server shares sidearm damage, enforces cadence, and reloads", async () => {
  const requireClient = createRequire(new URL("../../apps/client/package.json", import.meta.url));
  const { Client } = requireClient("@colyseus/sdk") as typeof import("../../apps/client/node_modules/@colyseus/sdk");
  const client = new Client("http://127.0.0.1:2567");
  const shooter = await client.create("prototype");
  const target = await client.joinById(shooter.roomId);
  type State = { id: string; health: number; ammo: number; reloading: boolean; x: number; z: number };
  let left: State[] = [];
  let right: State[] = [];
  let tick = 0;
  shooter.onMessage("snapshot", (s: { players: State[] }) => { left = s.players; });
  target.onMessage("snapshot", (s: { players: State[]; tick: number }) => {
    right = s.players;
    tick = s.tick;
  });
  const ammo = (players: State[]) => players.find((p) => p.id === shooter.sessionId)?.ammo;
  const health = (players: State[]) => players.find((p) => p.id === target.sessionId)?.health;
  try {
    await expect.poll(() => health(right)).toBe(100);
    shooter.send("fire", { yaw: Math.PI / 2, pitch: -0.12 });
    shooter.send("fire", { yaw: Math.PI / 2, pitch: -0.12 });
    await expect.poll(() => [ammo(left), ammo(right), health(left), health(right)])
      .toEqual([7, 7, 75, 75]);
    shooter.send("reload");
    await expect.poll(() => left.find((p) => p.id === shooter.sessionId)?.reloading).toBe(true);
    await expect.poll(() => [ammo(left), ammo(right)]).toEqual([8, 8]);

    for (let hits = 2; hits <= 4; hits++) {
      shooter.send("fire", { yaw: Math.PI / 2, pitch: -0.12 });
      await expect.poll(() => health(right)).toBe(100 - hits * 25);
      const nextShot = tick + 15;
      await expect.poll(() => tick).toBeGreaterThanOrEqual(nextShot);
    }
    await expect.poll(() => health(left)).toBe(0);
    await expect.poll(() => health(right), { timeout: 8_000 }).toBe(100);

    let sequence = 0;
    const targetState = () => right.find((p) => p.id === target.sessionId);
    async function moveUntil(strafe: number, forward: number, reached: (state: State) => boolean) {
      function send(x: number, z: number) {
        target.send("input", { seq: sequence++, strafe: x, forward: z, yaw: 0, run: false, crouch: false, jump: false });
      }
      const timer = setInterval(() => send(strafe, forward), 30);
      try {
        await expect.poll(() => {
          const state = targetState();
          return state ? reached(state) : false;
        }, { intervals: [25], timeout: 5000 }).toBe(true);
      } finally {
        clearInterval(timer);
        send(0, 0);
      }
    }
    await moveUntil(-1, 0, (state) => state.x <= 0.1);
    await moveUntil(0, 1, (state) => state.z <= -1.8);
    await moveUntil(-1, 0, (state) => state.x <= -0.95);

    const start = left.find((p) => p.id === shooter.sessionId)!;
    const end = targetState()!;
    shooter.send("fire", { yaw: Math.atan2(end.x - start.x, start.z - end.z), pitch: -0.16, viewTick: tick });
    await expect.poll(() => [ammo(left), ammo(right), health(left), health(right)])
      .toEqual([4, 4, 100, 100]);
  } finally {
    await Promise.all([shooter.leave(), target.leave()]);
  }
});

test("rapid clicks produce feedback only for a confirmed shot", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Graphics and physics ready")).toBeVisible();
  await page.getByRole("button", { name: "Join match" }).click();
  await expect(page.getByText("Practice sidearm: 8 rounds")).toBeVisible();
  const arena = page.getByLabel("3D scene preview");
  await arena.hover();
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await arena.evaluate((canvas) => {
    let flashes = 0;
    const animate = canvas.animate.bind(canvas);
    canvas.animate = (...args) => {
      canvas.setAttribute("data-test-flashes", String(++flashes));
      return animate(...args);
    };
    for (let i = 0; i < 2; i++) canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
  });
  await expect(page.getByText("Practice sidearm: 7 rounds")).toBeVisible();
  await expect(arena).toHaveAttribute("data-test-flashes", "1");
});

test("a delayed shot can hit the historical capsule, but stale and future ticks are rejected", async () => {
  const requireClient = createRequire(new URL("../../apps/client/package.json", import.meta.url));
  const { Client } = requireClient("@colyseus/sdk") as typeof import("../../apps/client/node_modules/@colyseus/sdk");
  const client = new Client("http://127.0.0.1:2567");
  const shooter = await client.create("prototype");
  const target = await client.joinById(shooter.roomId);
  type Snapshot = { tick: number; players: { id: string; x: number; z: number; health: number; ammo: number }[] };
  let latest: Snapshot | undefined;
  let anchor: Snapshot | undefined;
  let shotSent = false;
  const cadence: { tick: number; time: number }[] = [];
  let profiling = false;
  const player = (snapshot: Snapshot | undefined, id: string) => snapshot?.players.find((entry) => entry.id === id);
  const ammo = () => player(latest, shooter.sessionId)?.ammo;
  const health = () => player(latest, target.sessionId)?.health;
  const fire = (viewTick: number) => shooter.send("fire", { yaw: Math.PI / 2, pitch: -0.12, viewTick });
  shooter.onMessage("shot", () => {});
  target.onMessage("snapshot", () => {});
  shooter.onMessage("snapshot", (snapshot: Snapshot) => {
    latest = snapshot;
    if (profiling) cadence.push({ tick: snapshot.tick, time: performance.now() });
    if (!anchor || shotSent) return;
    const before = player(anchor, target.sessionId);
    const after = player(snapshot, target.sessionId);
    if (!before || !after || after.z - before.z <= 0.37) return;
    shotSent = true;
    fire(anchor.tick);
  });
  try {
    await expect.poll(health).toBe(100);
    anchor = latest;
    target.send("input", { seq: 0, forward: -1, strafe: 0, yaw: 0, run: true, crouch: false, jump: false });
    await expect.poll(health).toBe(75);
    expect(ammo()).toBe(7);
    target.send("stop", 1);
    await expect.poll(() => latest!.tick).toBeGreaterThan(anchor!.tick + 24);

    const rejectTick = latest!.tick;
    fire(anchor!.tick);
    fire(rejectTick + 120);
    await expect.poll(() => latest!.tick).toBeGreaterThan(rejectTick + 3);
    expect(ammo()).toBe(7);
    expect(health()).toBe(75);

    fire(latest!.tick);
    await expect.poll(ammo).toBe(6);
    expect(health()).toBe(75);

    profiling = true;
    await expect.poll(() => cadence.length).toBeGreaterThanOrEqual(21);
    const first = cadence[0];
    const last = cadence.at(-1)!;
    const seconds = (last.time - first.time) / 1000;
    expect(last.tick - first.tick).toBe((cadence.length - 1) * 3);
    console.log(`Observed over ${seconds.toFixed(2)} s: ${((last.tick - first.tick) / seconds).toFixed(1)} simulation Hz, ${((cadence.length - 1) / seconds).toFixed(1)} snapshot Hz`);
  } finally {
    await Promise.all([shooter.leave(), target.leave()]);
  }
});

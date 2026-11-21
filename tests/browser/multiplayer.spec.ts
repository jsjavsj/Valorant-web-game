import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

test("two browsers share server positions and a departing player is removed", async ({ browser }) => {
  test.setTimeout(60_000);
  const left = await browser.newPage();
  const right = await browser.newPage();
  const sent: (string | Buffer)[] = [];
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
    await left.keyboard.down("w");
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

    await left.getByRole("button", { name: "Leave match" }).click();
    await expect(right.getByText("1/2 players connected")).toBeVisible();
    await expect(second).toHaveAttribute("data-remote-position", "");
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
});

test("the server synchronizes a reset pad knockout and respawn", async () => {
  const requireClient = createRequire(new URL("../../apps/client/package.json", import.meta.url));
  const { Client } = requireClient("@colyseus/sdk") as typeof import("../../apps/client/node_modules/@colyseus/sdk");
  const client = new Client("http://127.0.0.1:2567");
  const amber = await client.create("prototype");
  type Snapshot = { players: { id: string; health: number; alive: boolean }[] };
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
    let seq = 0;
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

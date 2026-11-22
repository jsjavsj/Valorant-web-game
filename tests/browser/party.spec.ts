import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

test("two browsers can enter an invite-only party and start when both are ready", async ({ browser }) => {
  test.setTimeout(60_000);
  const host = await browser.newPage();
  const guest = await browser.newPage();
  try {
    await host.goto("/");
    await host.getByRole("button", { name: "Create private party" }).click();
    const invite = host.getByLabel("Invite code");
    await expect(invite).toHaveText(/^[A-F0-9]{10}$/);
    // Dispatch both changes in one browser task so neither handler can use a newer snapshot.
    await host.getByRole("group", { name: "Host settings" }).evaluate((fieldset) => {
      const team = fieldset.querySelector("select")!;
      const bot = fieldset.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      team.value = "teal";
      team.dispatchEvent(new Event("change", { bubbles: true }));
      bot.click();
    });
    const trainingBot = host.getByLabel("Add stationary training bot");
    await expect(trainingBot).toBeChecked();
    await expect(host.getByText("Host: teal · Guest: amber")).toBeVisible();
    await trainingBot.click();
    await expect(trainingBot).not.toBeChecked();

    await guest.goto("/");
    await guest.getByRole("textbox", { name: "Party code" }).fill(await invite.innerText());
    await guest.getByRole("button", { name: "Join by code" }).click();
    await expect(guest.getByText("2/2 players · 0/2 ready")).toBeVisible();
    await expect(guest.getByRole("button", { name: "Start match" })).toHaveCount(0);
    const start = host.getByRole("button", { name: "Start match" });
    await expect(start).toBeDisabled();
    await expect(guest.getByText("Host: teal · Guest: amber")).toBeVisible();
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await start.click();
    await expect(host.getByText("Practice sidearm: 8 rounds")).toBeVisible();
    await expect(guest.getByText("Practice sidearm: 8 rounds")).toBeVisible();
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test("party authorization is based on the connected session, and the bot can fill a slot", async () => {
  const requireClient = createRequire(new URL("../../apps/client/package.json", import.meta.url));
  const { Client } = requireClient("@colyseus/sdk") as typeof import("../../apps/client/node_modules/@colyseus/sdk");
  const client = new Client("http://127.0.0.1:2567");
  const host = await client.create("party");
  type Snapshot = { tick: number; players: { id: string }[]; party: { started: boolean; ready: string[];
    settings: { hostTeam: string; bot: boolean; allowDuplicateAgents: boolean } } };
  let latest: Snapshot | undefined;
  host.onMessage("snapshot", (snapshot: Snapshot) => { latest = snapshot; });
  try {
    await expect(client.joinById(host.roomId, { code: "0000000000" })).rejects.toThrow();
    const guest = await client.joinById(host.roomId, { code: host.roomId });
    guest.onMessage("snapshot", () => {});
    try {
      await expect.poll(() => latest?.players.length).toBe(2);
      host.send("party-ready", true);
      guest.send("party-ready", true);
      await expect.poll(() => latest?.party.ready.length).toBe(2);
      const tick = latest!.tick;
      guest.send("party-settings", { hostTeam: "teal" });
      guest.send("party-start");
      await expect.poll(() => latest?.tick ?? 0).toBeGreaterThan(tick + 12);
      expect(latest?.party.settings.hostTeam).toBe("amber");
      expect(latest?.party.started).toBe(false);
    } finally {
      await guest.leave();
    }
    await expect.poll(() => latest?.players.length).toBe(1);
    host.send("party-settings", { bot: true });
    await expect.poll(() => latest?.party.settings.bot).toBe(true);
    host.send("party-ready", true);
    await expect.poll(() => latest?.party.ready.length).toBe(1);
    host.send("party-start");
    await expect.poll(() => latest?.players.some(({id}) => id === ":training-bot")).toBe(true);
    await expect(client.joinById(host.roomId, { code: host.roomId })).rejects.toThrow();
  } finally {
    await host.leave();
  }
});

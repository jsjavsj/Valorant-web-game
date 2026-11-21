import { expect, test } from "@playwright/test";

test("two browsers share server positions and a departing player is removed", async ({ browser }) => {
  test.setTimeout(60_000);
  const left = await browser.newPage();
  const right = await browser.newPage();
  try {
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

    async function remoteDepth() {
      return Number((await second.getAttribute("data-remote-position"))?.split(",")[2]);
    }
    await expect.poll(remoteDepth).toBeGreaterThan(4.8);
    await left.bringToFront();
    await first.click();
    await expect.poll(() => left.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await left.keyboard.down("w");
    await expect.poll(remoteDepth, { timeout: 15_000 }).toBeLessThan(4);
    await left.keyboard.up("w");
    await left.evaluate(() => document.exitPointerLock());
    await expect.poll(() => left.evaluate(() => document.pointerLockElement === null)).toBe(true);

    await right.bringToFront();
    await second.click();
    await expect.poll(() => right.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await right.keyboard.down("w");
    await expect(first).toHaveAttribute("data-remote-alive", "false", { timeout: 12_000 });
    await right.keyboard.up("w");
    await expect(right.getByText("Respawning…")).toBeVisible();
    await expect(first).toHaveAttribute("data-remote-alive", "true", { timeout: 10_000 });
    await expect(right.getByText("Health: 100")).toBeVisible();
    await right.evaluate(() => document.exitPointerLock());
    await left.bringToFront();
    await left.getByRole("button", { name: "Leave match" }).click();
    await expect(right.getByText("1/2 players connected")).toBeVisible();
    await expect(second).toHaveAttribute("data-remote-position", "");
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
});

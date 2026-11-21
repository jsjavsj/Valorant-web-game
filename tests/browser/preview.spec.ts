import { expect, test } from "@playwright/test";

test("renders the built preview, including the drone at its authored scale in motion", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const contexts = [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype];
    for (const context of contexts) {
      const drawElements = context.drawElements;
      context.drawElements = function (this: WebGLRenderingContext | WebGL2RenderingContext, ...args) {
        drawElements.apply(this, args);
        if (this.canvas instanceof HTMLCanvasElement && args[1] > 0 && !this.isContextLost()) {
          this.canvas.dataset.previewDrawn = "true";
        }
      };
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pumpworks" })).toBeVisible();
  await expect(page.getByText("Game server ready", { exact: true })).toBeVisible();
  await expect(page.getByText("Graphics and physics ready", { exact: true })).toBeVisible();
  await expect(page.getByLabel("3D scene preview")).toHaveAttribute("data-preview-drawn", "true");
  const preview = page.getByLabel("3D scene preview");
  await expect(preview).toHaveAttribute("data-character-animation", "Idle");
  const dimensions = (await preview.getAttribute("data-character-dimensions"))?.split(",").map(Number);
  expect(dimensions).toHaveLength(3);
  expect(dimensions?.[0]).toBeCloseTo(0.65, 3);
  expect(dimensions?.[1]).toBeCloseTo(1.8, 3);
  expect(dimensions?.[2]).toBeCloseTo(0.65, 3);
  await expect(preview).toHaveAttribute("data-character-moved", "true");
  const health = await (await page.request.get("/health")).json();
  expect(health.assetColliderCount).toBe(1);
  await expect(preview).toHaveAttribute("data-asset-collider-count", "1");
  expect(pageErrors).toEqual([]);
});

test("moves in first person and clears input on blur", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await expect(page.getByText("Graphics and physics ready", { exact: true })).toBeVisible();
  const arena = page.getByLabel("3D scene preview");
  await arena.hover();
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  async function position() {
    return (await arena.getAttribute("data-player-position"))?.split(",").map(Number) ?? [];
  }

  const [x, , z] = await position();
  await page.keyboard.down("w");
  await expect.poll(async () => {
    const [nowX, , nowZ] = await position();
    return Math.hypot(nowX - x, nowZ - z);
  }, { timeout: 15_000 }).toBeGreaterThan(0.3);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const stoppedAt = (await position()).filter((_, index) => index !== 1);
  await page.waitForTimeout(250);
  expect((await position()).filter((_, index) => index !== 1)).toEqual(stoppedAt);
  await page.keyboard.up("w");
});

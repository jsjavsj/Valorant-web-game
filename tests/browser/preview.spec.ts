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

test("moves in first person, stops at the pump and clears input on blur", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await expect(page.getByText("Graphics and physics ready", { exact: true })).toBeVisible();
  const arena = page.getByLabel("3D scene preview");
  await arena.hover();
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);

  async function depth() {
    const position = await arena.getAttribute("data-player-position");
    return Number(position?.split(",")[2]);
  }

  await page.keyboard.down("w");
  await expect.poll(depth, { timeout: 15_000 }).toBeLessThan(0.9);
  await page.waitForTimeout(300);
  expect(await depth()).toBeGreaterThan(0.8);
  await page.keyboard.up("w");

  await page.keyboard.down("s");
  await expect.poll(depth, { timeout: 10_000 }).toBeGreaterThan(1.5);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(150);
  const stoppedAt = await depth();
  await page.waitForTimeout(150);
  expect(await depth()).toBeCloseTo(stoppedAt, 3);
  await page.keyboard.up("s");
});

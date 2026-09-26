import { expect, test } from "@playwright/test";

test("the visual session path fits a narrow phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start a Free Session" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.getByRole("button", { name: "Start a Free Session" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("button", { name: "Start now" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("scene motion follows the user's reduced-motion preference", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const hero = page.locator(".scene-art--hero");
  await expect(hero).toBeVisible();
  const animation = (selector: string) =>
    hero.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

  // Movement stops; gentle opacity ambience (twinkling stars) stays.
  expect(await animation(".scene-plane--mist")).toBe("none");
  expect(await animation(".scene-image")).toBe("none");
  expect(await animation(".fx-stars")).toBe("scene-twinkle");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => animation(".scene-plane--mist")).toBe("scene-drift");
});

test("the landing scene follows the pointer with depth", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".landing-hero");
  const box = await hero.boundingBox();
  if (!box) throw new Error("hero not rendered");
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.1);

  const shiftX = (plane: string) =>
    page.locator(`.scene-art--hero .scene-plane--${plane}`)
      .evaluate((el) => parseFloat(getComputedStyle(el).translate));
  // Toward the upper right, the near mist slides left further than the sky.
  await expect.poll(() => shiftX("mist")).toBeLessThan(-20);
  expect(Math.abs(await shiftX("stars"))).toBeLessThan(Math.abs(await shiftX("mist")));
});

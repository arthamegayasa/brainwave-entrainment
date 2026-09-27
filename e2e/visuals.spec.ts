import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EVENING_THETA, importSession, openSessions, playFromLibrary } from "./helpers";

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

/** The CSS animations in the Player's Scene: each one's name and the properties it animates. */
function playerSceneAnimations(page: Page): Promise<Array<{ name: string; properties: string[] }>> {
  return page.locator(".player .scene-art").evaluate((art) =>
    art
      .getAnimations({ subtree: true })
      .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
      .map((animation) => ({
        name: animation.animationName,
        properties: (animation.effect as KeyframeEffect)
          .getKeyframes()
          .flatMap((frame) => Object.keys(frame))
          .filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key)),
      })),
  );
}

// Each new Nature Scene and the movements its live layers add to the painting.
const NATURE_SCENES = [
  { id: "deep-ocean", label: "Deep Ocean", moves: ["scene-drift", "scene-rays-sway", "scene-float"] },
  { id: "nebula", label: "Nebula", moves: ["scene-drift", "scene-drift-slow", "scene-meteor"] },
  { id: "lavender-field", label: "Lavender Field", moves: ["scene-drift", "scene-rays-sway", "scene-float"] },
];

for (const scene of NATURE_SCENES) {
  test(`the ${scene.label} Scene moves in the Player, and only glows under reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSessions(page);
    const row = await importSession(page, { ...EVENING_THETA, name: scene.label, sceneId: scene.id });
    await playFromLibrary(page, row, "15 min");
    await expect(page.locator(".player .scene-art")).toHaveAttribute("data-scene", scene.id);

    // Movement stops; gentle opacity ambience (the glow of the light) stays.
    const still = await playerSceneAnimations(page);
    expect(still.filter((animation) => animation.properties.some((property) => property !== "opacity"))).toEqual([]);
    expect(still.map((animation) => animation.name)).toContain("scene-pulse");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect
      .poll(async () => (await playerSceneAnimations(page)).map((animation) => animation.name))
      .toEqual(expect.arrayContaining(scene.moves));
  });
}

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

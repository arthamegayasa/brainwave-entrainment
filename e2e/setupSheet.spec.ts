import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { audioStates, openSessions, recordAudioContexts, setUpPreset } from "./helpers";

/** The Preset setup sheet, once its opening animation has settled. */
async function setupSheet(page: Page, preset: string): Promise<Locator> {
  const sheet = page.getByRole("dialog", { name: `Set up the ${preset} session` });
  await expect(sheet).toBeVisible();
  await sheet.evaluate(async (el) => {
    await document.fonts.ready;
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  return sheet;
}

/**
 * What the sheet hides from a User who does not scroll: parts that overflow a
 * scroll area of the sheet, and controls or text that are off screen or covered.
 */
function hiddenParts(sheet: Locator) {
  return sheet.evaluate((root) => {
    const scrolls = (el: Element, axis: "x" | "y") => {
      const style = getComputedStyle(el);
      const overflow = axis === "y" ? style.overflowY : style.overflowX;
      if (overflow !== "auto" && overflow !== "scroll") return false;
      return axis === "y" ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
    };
    const elements = [root, ...root.querySelectorAll("*")];
    const offscreen = [...root.querySelectorAll("button, p, h2")].filter((part) => {
      const box = part.getBoundingClientRect();
      if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) return true;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === null || !part.contains(hit);
    });
    return {
      scrollsDown: elements.filter((el) => scrolls(el, "y")).length,
      scrollsSideways: elements.filter((el) => scrolls(el, "x")).length,
      offscreen: offscreen.map((part) => part.getAttribute("aria-label") ?? part.textContent),
    };
  });
}

test("every Preset setup sheet fits a phone screen without scrolling, Start included", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSessions(page);
  const cards = page.locator(".preset-card");
  await expect(cards).not.toHaveCount(0);
  for (const name of await cards.locator("h3").allTextContents()) {
    await cards.filter({ has: page.getByText(name, { exact: true }) }).click();
    const sheet = await setupSheet(page, name);
    // 60 min is the tallest setup: it adds the long-export warning under Download MP3.
    await sheet.getByRole("button", { name: "60 min", exact: true }).click();
    await expect(sheet.getByText("Long exports need a powerful device")).toBeVisible();
    expect(await hiddenParts(sheet), name).toEqual({ scrollsDown: 0, scrollsSideways: 0, offscreen: [] });
    await expect(sheet.getByRole("button", { name: "Start Session" })).toBeInViewport({ ratio: 1 });
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toHaveCount(0);
  }
});

test("on a screen too short for the choices, they scroll while Start stays pinned in view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 });
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");
  const sheet = await setupSheet(page, "Meditating");
  const start = sheet.getByRole("button", { name: "Start Session" });
  await expect(start).toBeInViewport({ ratio: 1 });
  const pinnedAt = await start.boundingBox();
  expect((await hiddenParts(sheet)).offscreen).toContain("Brown Noise");

  const brownNoise = sheet.getByRole("button", { name: "Brown Noise" });
  await brownNoise.click();
  await expect(brownNoise).toHaveAttribute("aria-pressed", "true");
  expect(await start.boundingBox()).toEqual(pinnedAt);
  await expect(start).toBeInViewport({ ratio: 1 });
});

test("the Preset setup sheet has no sideways scrolling on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openSessions(page);
  await setUpPreset(page, "Meditating", "∞");
  const sheet = await setupSheet(page, "Meditating");
  expect((await hiddenParts(sheet)).scrollsSideways).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await expect(sheet.getByRole("button", { name: "Start Session" })).toBeInViewport({ ratio: 1 });
});

test("every setup choice is selectable and starts the Play it describes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await recordAudioContexts(page);
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");
  const sheet = await setupSheet(page, "Meditating");
  for (const [group, choice] of [["Duration", "45 min"], ["How to listen", "Speaker"], ["Ambient", "Wind"]]) {
    const options = sheet.getByRole("group", { name: group });
    await options.getByRole("button", { name: new RegExp(choice) }).click();
    const pressed = options.getByRole("button", { pressed: true });
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveAccessibleName(new RegExp(choice));
  }
  await sheet.getByRole("button", { name: "Start Session" }).click();

  await expect(page.locator(".player .timer")).toHaveText(/^4[45]:\d\d$/);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(page.getByRole("button", { name: /Speaker · Frequency details/ })).toBeVisible();
  await page.getByRole("button", { name: "Ambient", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ambient" }).getByRole("button", { name: "Wind" }))
    .toHaveAttribute("aria-pressed", "true");
});

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { audioStates, openSessions, recordAudioContexts, setUpPreset } from "./helpers";

declare global {
  interface Window {
    /** How many times the device-paused prompt appeared since countPrompts(). */
    __prompts: number;
  }
}

/** Count every appearance of the device-paused prompt from now on, however brief. */
async function countPrompts(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__prompts = 0;
    let shown = false;
    new MutationObserver(() => {
      const now = document.querySelector('[role="alert"]') !== null;
      if (now && !shown) window.__prompts++;
      shown = now;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

test.beforeEach(async ({ page }) => {
  await recordAudioContexts(page);
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
});

test("resuming a paused Play never shows the device-paused prompt", async ({ page }) => {
  await page.getByRole("button", { name: /Pause/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);

  await countPrompts(page);
  await page.getByRole("button", { name: /Resume/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(page.getByText("Paused")).toHaveCount(0);
  expect(await page.evaluate(() => window.__prompts)).toBe(0);
});

test("a later Play starts without the device-paused prompt", async ({ page }) => {
  await page.waitForTimeout(2000); // past the first start's grace period
  await page.getByRole("button", { name: /End Session/ }).click();
  // Idle, the device is released: the next start resumes a suspended context.
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);

  await countPrompts(page);
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  expect(await page.evaluate(() => window.__prompts)).toBe(0);
});

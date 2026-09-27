import { expect, test } from "@playwright/test";
import { audioStates, openSessions, recordAudioContexts, setUpPreset } from "./helpers";

test.beforeEach(async ({ page }) => {
  await recordAudioContexts(page);
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
});

test("a preset session plays, pauses in place, resumes, and ends", async ({ page }) => {
  const timer = page.locator(".timer");
  await expect(timer).not.toHaveText("15:00");
  expect(await audioStates(page)).toEqual(["running"]);

  await page.getByRole("button", { name: /Pause/ }).click();
  await expect(page.getByText("Paused")).toBeVisible();
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  const heldAt = await timer.textContent();
  await page.waitForTimeout(2500);
  await expect(timer).toHaveText(heldAt ?? "");
  // A user pause is not a device interruption: no Resume prompt.
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: /Resume/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(timer).not.toHaveText(heldAt ?? "");

  await page.getByRole("button", { name: /End Session/ }).click();
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  // Nothing plays any more, so the device is released.
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
});

test("a device pause the browser refuses to undo asks for a tap, then continues", async ({
  page,
}) => {
  const timer = page.locator(".timer");
  await expect(timer).not.toHaveText("15:00");

  // Simulate a call/alarm on a browser that only resumes from a user gesture.
  await page.evaluate(() => {
    const ctx = window.__audioContexts[0];
    ctx.resume = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    return ctx.suspend();
  });
  const banner = page.getByRole("alert");
  await expect(banner).toContainText("Your device paused the audio");
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(true);
  const heldAt = await timer.textContent();
  await page.waitForTimeout(2000);
  await expect(timer).toHaveText(heldAt ?? "");

  await page.evaluate(() => Reflect.deleteProperty(window.__audioContexts[0], "resume"));
  await banner.getByRole("button", { name: "Resume audio" }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
  await expect(timer).not.toHaveText(heldAt ?? "");
});

test("a device pause the browser allows to undo recovers without asking", async ({ page }) => {
  await expect(page.locator(".timer")).not.toHaveText("15:00");
  await page.evaluate(() => window.__audioContexts[0].suspend());
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

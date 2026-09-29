import { expect, test } from "@playwright/test";
import {
  audioStates,
  frequencyValue,
  importSession,
  liveFrequencies,
  openSessions,
  playFromLibrary,
  recordAudioContexts,
  recordLiveOutput,
  setUpPreset,
  shownHz,
} from "./helpers";

for (const mode of ["Headphones", "Speaker"] as const) {
  test(`Media controls leave the Preset's ${mode} live Carrier frequency accurate per channel`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await recordAudioContexts(page);
    await recordLiveOutput(page);
    await openSessions(page);
    await setUpPreset(page, "Meditating", "15 min");
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(mode) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "No ambient" }).click();
    await page.getByRole("button", { name: "Start Session" }).click();
    await expect.poll(() => audioStates(page)).toEqual(["running"]);
    await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
    expect(pageErrors).toEqual([]);
    await expect(page.locator(".player")).toBeVisible();
    await page.getByRole("button", { name: /Frequency details/ }).click();
    await page.waitForTimeout(1800); // full fade-in and at least one complete FFT frame
    const values = page.getByRole("dialog", { name: "Frequency details" }).locator(".freq-grid .v");
    const carrier = Number((await values.first().textContent())?.split(" ")[0]);
    const beat = Number((await values.nth(mode === "Headphones" ? 2 : 1).textContent())?.split(" ")[0]);
    const target = [carrier, carrier + (mode === "Headphones" ? beat : 0)];
    const measured = await liveFrequencies(page, target);
    for (const channel of [0, 1]) {
      expect(measured[channel], `${mode} channel ${channel} measured ${measured[channel]} Hz, target ${target[channel]} Hz`)
        .toBeGreaterThanOrEqual(target[channel] - 0.1);
      expect(measured[channel]).toBeLessThanOrEqual(target[channel] + 0.1);
    }
  });
}

test("a single-layer saved Studio session plays from the Library through the duration sheet into the Player, its live output matching the displayed frequencies", async ({
  page,
}) => {
  await recordAudioContexts(page);
  await recordLiveOutput(page);
  await openSessions(page);
  const row = await importSession(page, {
    version: 2,
    id: "single-layer",
    name: "Single Layer",
    journey: { startHz: 10, points: [{ hz: 10, minutes: 5, easing: "linear" }], holdAt: 0 },
    layers: [{
      id: "binaural",
      type: "binaural",
      carrierHz: 200,
      beatMode: "fixed",
      fixedBeatHz: 10,
      gain: 0.7,
    }],
    createdAt: "2026-09-20T10:00:00.000Z",
  });
  await playFromLibrary(page, row, "15 min");
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("Single Layer");

  await page.getByRole("button", { name: /Frequency details/ }).click();
  const details = page.getByRole("dialog", { name: "Frequency details" });
  const target = [
    await shownHz(frequencyValue(details, "Left · Carrier")),
    await shownHz(frequencyValue(details, "Right · Carrier + Beat")),
  ];
  expect(target).toEqual([200, 210]); // the layer's Carrier, and Carrier + its fixed Beat
  await page.waitForTimeout(1800); // observe a full FFT window after fade-in
  const measured = await liveFrequencies(page, target);
  for (const channel of [0, 1]) {
    expect(Math.abs(measured[channel] - target[channel]), `channel ${channel} measured ${measured[channel]} Hz, displayed ${target[channel]} Hz`)
      .toBeLessThanOrEqual(0.1);
  }
});

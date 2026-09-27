import { expect, test } from "@playwright/test";
import { audioStates, liveFrequencies, openSessions, recordAudioContexts, recordLiveOutput, setUpPreset } from "./helpers";

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
    await page.locator(".player-panels").getByText("Frequency details").click();
    await page.waitForTimeout(1800); // full fade-in and at least one complete FFT frame
    const carrier = Number((await page.locator(".freq-grid .v").nth(1).textContent())?.split(" ")[0]);
    const beat = Number((await page.locator(".freq-grid .v").first().textContent())?.split(" ")[0]);
    const target = [carrier, carrier + (mode === "Headphones" ? beat : 0)];
    const measured = await liveFrequencies(page, target);
    for (const channel of [0, 1]) {
      expect(measured[channel], `${mode} channel ${channel} measured ${measured[channel]} Hz, target ${target[channel]} Hz`)
        .toBeGreaterThanOrEqual(target[channel] - 0.1);
      expect(measured[channel]).toBeLessThanOrEqual(target[channel] + 0.1);
    }
  });
}

test("Media controls preserve a single-layer Custom Audio's live left and right frequencies", async ({ page }) => {
  await recordAudioContexts(page);
  await recordLiveOutput(page);
  await openSessions(page);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "single-layer.swarasanti.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      version: 1,
      id: "single-layer",
      name: "Single Layer",
      curve: { startHz: 10, targetHz: 10, endHz: null, rampInMin: 5, rampOutMin: 0 },
      layers: [{
        id: "binaural",
        type: "binaural",
        carrierHz: 200,
        beatMode: "fixed",
        fixedBeatHz: 10,
        gain: 0.7,
      }],
      createdAt: "2026-09-20T10:00:00.000Z",
    })),
  });
  await page.locator(".library-item", { hasText: "Single Layer" })
    .getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("Single Layer");
  await page.waitForTimeout(1800); // observe a full FFT window after fade-in
  const measured = await liveFrequencies(page, [200, 210]);
  expect(Math.abs(measured[0] - 200), `Custom Audio left Carrier: ${measured[0]} Hz`).toBeLessThanOrEqual(0.1);
  expect(Math.abs(measured[1] - 210), `Custom Audio right Carrier + Beat: ${measured[1]} Hz`).toBeLessThanOrEqual(0.1);
});

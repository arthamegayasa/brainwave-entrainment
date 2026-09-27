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

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { advanceAudioClock, audioStates, endPlay, openSessions, recordAudioContexts, setUpPreset } from "./helpers";

declare global {
  interface Window {
    __wake: { requests: number; releases: number };
    /** Appearances of device-held transport after monitoring begins. */
    __holds: number;
  }
}

async function countDeviceHolds(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__holds = 0;
    let shown = false;
    new MutationObserver(() => {
      const now = document.querySelector('button[aria-label="Tap to resume"]') !== null;
      if (now && !shown) window.__holds++;
      shown = now;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

async function startPreset(page: Page) {
  await recordAudioContexts(page);
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".player")).toBeVisible();
}

test("the Preset Player fits a phone and keeps the desktop navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startPreset(page);
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".foot")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const controls = await page.getByRole("button", { name: "Pause Play" }).boundingBox();
  expect(controls).not.toBeNull();
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(844);
  const emblem = await page.getByRole("button", { name: /Frequency details/ }).boundingBox();
  expect(emblem).not.toBeNull();
  expect(emblem!.y + emblem!.height).toBeLessThanOrEqual(844);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".foot")).toBeVisible();
});

test("End session is only in the Player menu and stops without confirmation", async ({ page }) => {
  await startPreset(page);
  await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);
  await endPlay(page);
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
});

test("Ambient and Mixer sheets adjust the running Preset Play", async ({ page }) => {
  await startPreset(page);
  await page.getByRole("button", { name: "Ambient", exact: true }).click();
  const ambient = page.getByRole("dialog", { name: "Ambient" });
  await ambient.getByRole("button", { name: "Rain" }).click();
  await expect(ambient.getByRole("button", { name: "Rain" })).toHaveAttribute("aria-pressed", "true");
  await ambient.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  const mixer = page.getByRole("dialog", { name: "Mixer" });
  await mixer.getByRole("slider", { name: "Master volume" }).press("Home");
  await expect(mixer.getByText("0%", { exact: true })).toBeVisible();
  await mixer.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Ambient", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ambient" })
    .getByRole("button", { name: "Rain" })).toHaveAttribute("aria-pressed", "true");
});

for (const mode of ["Headphones", "Speaker"] as const) {
  test(`${mode} frequency details follow the Preset Beat ramp`, async ({ page }) => {
    await recordAudioContexts(page);
    await openSessions(page);
    await setUpPreset(page, "Meditating", "15 min");
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(mode) }).click();
    await page.getByRole("button", { name: "Start Session" }).click();
    await page.getByRole("button", { name: /Frequency details/ }).click();
    const details = page.getByRole("dialog", { name: "Frequency details" });
    if (mode === "Headphones") {
      await expect(details.getByText("Left · Carrier")).toBeVisible();
      await expect(details.getByText("Right · Carrier + Beat")).toBeVisible();
      await expect(details.getByText("Use headphones", { exact: false })).toBeVisible();
    } else {
      await expect(details.getByText("Tone · Carrier")).toBeVisible();
      await expect(details.getByText("Pulse · Beat")).toBeVisible();
      await expect(details.getByText("Right · Carrier + Beat")).toHaveCount(0);
    }
    const values = details.locator(".freq-grid .v");
    const read = async (index: number) => Number((await values.nth(index).textContent())?.split(" ")[0]);
    const carrier = await read(0);
    const beatIndex = mode === "Headphones" ? 2 : 1;
    const initialBeat = await read(beatIndex);
    if (mode === "Headphones") expect(Math.abs(await read(1) - carrier - initialBeat)).toBeLessThan(0.03);
    await advanceAudioClock(page, 120);
    await expect.poll(() => read(beatIndex)).toBeLessThan(initialBeat);
    if (mode === "Headphones") expect(Math.abs(await read(1) - carrier - await read(beatIndex))).toBeLessThan(0.03);
    else expect(await read(0)).toBe(carrier);
  });
}

test("controls fade after six seconds of playing, return on tap, and stay while paused", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await startPreset(page);
  const controls = page.locator(".player-controls");
  await expect(controls).toHaveCSS("opacity", "1");
  await page.clock.runFor(6500);
  await expect(controls).toHaveCSS("opacity", "0");
  await expect(page.locator(".timer")).toHaveCSS("opacity", "0.35");
  await page.locator(".player-stage").click({ position: { x: 10, y: 10 } });
  await expect(controls).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Pause Play" }).click();
  await page.clock.runFor(7000);
  await expect(controls).toHaveCSS("opacity", "1");
});

test("choosing Keep screen on dismisses the menu so the Player can dim", async ({ page }) => {
  await page.clock.install();
  await startPreset(page);
  await page.getByRole("button", { name: "More options" }).click();
  await page.locator(".player-stage").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Keep screen on" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.clock.runFor(6500);
  await expect(page.locator(".player-controls")).toHaveCSS("opacity", "0");
});

test("keyboard focus reveals dimmed Player controls before activation", async ({ page }) => {
  await page.clock.install();
  await startPreset(page);
  await page.getByRole("button", { name: "Account" }).focus();
  await page.clock.runFor(6500);
  await expect(page.locator(".player-header")).toHaveCSS("opacity", "0");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "More options" })).toBeFocused();
  await expect(page.locator(".player-header")).toHaveCSS("opacity", "1");
});

test("unavailable Screen Wake Lock does not interrupt the Play", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });
  });
  await startPreset(page);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Keep screen on" }).click();
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("status")).toContainText("unavailable");
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
});

test("Keep screen on releases on pause, hiding, and end; resumes while visible", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { requests: 0, releases: 0 };
    Object.defineProperty(window, "__wake", { value: state });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: async () => {
        state.requests++;
        return { release: async () => { state.releases++; } };
      } },
    });
  });
  const wake = () => page.evaluate(() => window.__wake);
  await startPreset(page);
  expect(await wake()).toEqual({ requests: 0, releases: 0 });
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Keep screen on" }).click();
  await expect.poll(async () => (await wake()).requests).toBe(1);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Pause Play" }).click();
  await expect.poll(async () => (await wake()).releases).toBe(1);
  await page.getByRole("button", { name: "Resume Play" }).click();
  await expect.poll(async () => (await wake()).requests).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await wake()).releases).toBe(2);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await wake()).requests).toBe(3);
  await endPlay(page);
  await expect.poll(async () => (await wake()).releases).toBe(3);
});

test("resuming a User-paused Play never shows the device-held transport", async ({ page }) => {
  await startPreset(page);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.getByRole("button", { name: "Pause Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await countDeviceHolds(page);
  await page.getByRole("button", { name: "Resume Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  expect(await page.evaluate(() => window.__holds)).toBe(0);
});

test("a subsequent Preset Play starts without a device-held prompt", async ({ page }) => {
  await startPreset(page);
  await page.waitForTimeout(2000); // past the initial start's grace period
  await endPlay(page);
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await countDeviceHolds(page);
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  expect(await page.evaluate(() => window.__holds)).toBe(0);
});

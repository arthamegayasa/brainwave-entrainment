import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  EVENING_THETA,
  advanceAudioClock,
  audioStates,
  endPlay,
  importSession,
  openSessions,
  playFromLibrary,
  recordAudioContexts,
  setUpPreset,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  // A Wednesday noon: every test stays inside one Monday–Sunday week. The wall
  // clock runs on its own; time heard is moved on the audio clock only.
  await page.clock.install({ time: new Date("2026-09-23T12:00:00") });
  await recordAudioContexts(page);
  await openSessions(page);
});

/** Start Meditating for 15 minutes from Sessions. */
async function startPreset(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".timer")).not.toHaveText("15:00");
}

/** Listen to a Preset for 5 minutes, end it, and read the completion card's weekly count. */
async function completePreset(page: Page): Promise<Locator> {
  await startPreset(page);
  await advanceAudioClock(page, 301);
  await endPlay(page);
  return page.getByText(/^Session #\d+ this week$/);
}

/** Evening Theta with a second entrainment layer on a fixed Beat and an ambient bed. */
const LAYERED_THETA = {
  ...EVENING_THETA,
  id: "layered-theta",
  name: "Layered Theta",
  layers: [
    ...EVENING_THETA.layers,
    { id: "layer-2", type: "isochronic", carrierHz: 432, beatMode: "fixed", fixedBeatHz: 12, gain: 0.5 },
    { id: "layer-3", type: "rain", carrierHz: 0, beatMode: "follow", fixedBeatHz: 6, gain: 0.4 },
  ],
};

const playerTimer = (page: Page) => page.locator(".player .timer");

test("Play on a Custom Audio asks only for a length, defaulting to the last one used, then opens the Player", async ({
  page,
}) => {
  const row = await importSession(page);
  await row.getByRole("button", { name: "Play", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Set up Evening Theta" });
  await expect(sheet.getByRole("button", { name: "30 min", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: /Headphones|Speaker|ambient/i })).toHaveCount(0);
  await sheet.getByRole("button", { name: "15 min", exact: true }).click();
  await sheet.getByRole("button", { name: "Start Session" }).click();

  await expect(page.locator(".player").getByRole("heading", { name: "Evening Theta" })).toBeVisible();
  await expect(playerTimer(page)).toHaveText(/^1[45]:\d\d$/);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);

  await endPlay(page);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await row.getByRole("button", { name: "Play", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "15 min", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Custom Audio pauses and resumes in place from the Player", async ({ page }) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await expect.poll(() => audioStates(page)).toEqual(["running"]);

  await page.getByRole("button", { name: "Pause Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect(page.locator(".phase-label")).toHaveText("Paused");
  const heldAt = await playerTimer(page).textContent();
  await page.waitForTimeout(2000);
  await expect(playerTimer(page)).toHaveText(heldAt ?? "");

  await page.getByRole("button", { name: "Resume Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(playerTimer(page)).not.toHaveText(heldAt ?? "");
});

test("the Custom Audio Player has no Ambient or Mixer and shows each entrainment layer's frequencies", async ({
  page,
}) => {
  const row = await importSession(page, LAYERED_THETA);
  await playFromLibrary(page, row, "15 min");
  await expect(page.getByRole("button", { name: "Ambient", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mixer", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /Frequency details/ }).click();
  const details = page.getByRole("dialog", { name: "Frequency details" });
  const binaural = details.getByRole("group", { name: "Binaural" });
  const isochronic = details.getByRole("group", { name: "Isochronic" });
  await expect(details.getByRole("group")).toHaveCount(2); // the rain bed has no frequencies
  const value = (layer: Locator, label: string) =>
    layer.locator(".freq-item").filter({ has: page.getByText(label, { exact: true }) }).locator(".v");
  const hz = async (layer: Locator, label: string) =>
    Number((await value(layer, label).textContent())?.split(" ")[0]);
  await expect(value(binaural, "Left · Carrier")).toHaveText("200.00 Hz");
  // The binaural layer follows the ramp, which has just left 10 Hz.
  const beat = await hz(binaural, "Beat");
  expect(beat).toBeGreaterThan(9.9);
  expect(beat).toBeLessThanOrEqual(10);
  expect(Math.abs((await hz(binaural, "Right · Carrier + Beat")) - 200 - (await hz(binaural, "Beat"))))
    .toBeLessThan(0.03);
  await expect(value(isochronic, "Tone · Carrier")).toHaveText("432.00 Hz");
  await expect(value(isochronic, "Pulse · Beat")).toHaveText("12.00 Hz");
  await expect(details.getByText("Use headphones", { exact: false })).toBeVisible();

  // The ramp moves the binaural Beat (10 → 6 Hz over 5 minutes); the fixed Beat stays.
  await advanceAudioClock(page, 150);
  await expect(value(binaural, "Beat")).toHaveText(/^[78]\.\d\d Hz$/);
  await expect(value(isochronic, "Pulse · Beat")).toHaveText("12.00 Hz");
});

test("the Custom Audio Player fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await importSession(page);
  await playFromLibrary(page, row, "∞");
  await expect(page.locator(".topbar")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  const toggle = await page.getByRole("button", { name: "Pause Play" }).boundingBox();
  expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(844);
});

test("the playing Library row shows Playing and opens the Player without restarting the Play", async ({
  page,
}) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 120);
  await expect(playerTimer(page)).toHaveText(/^12:\d\d$/);

  await page.getByRole("button", { name: "Minimize Player" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  // Leaving the Library and coming back still marks the running Play.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const playing = row.getByRole("button", { name: /^Playing/ });
  await expect(playing).toBeVisible();
  await expect(row.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);

  await playing.click();
  await expect(playerTimer(page)).toHaveText(/^12:\d\d$/);
  expect(await audioStates(page)).toEqual(["running"]);
});

test("a Custom Audio ended from the Player after 5 minutes shows the completion card and counts", async ({
  page,
}) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 301);
  await endPlay(page);
  await expect(page.getByRole("heading", { name: "Evening Theta complete" })).toBeVisible();
  await expect(page.getByText("Session #1 this week")).toBeVisible();

  await page.getByRole("button", { name: "Back to Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(await completePreset(page)).toHaveText("Session #2 this week");
});

test("a Custom Audio ended before 5 minutes returns to the Library without a card or credit", async ({
  page,
}) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 270);
  await endPlay(page);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText(/^Session #\d+ this week$/)).toHaveCount(0);

  await expect(await completePreset(page)).toHaveText("Session #1 this week");
});

test("a Custom Audio that reaches its natural end shows the completion card", async ({ page }) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 15 * 60);
  await expect(page.getByRole("heading", { name: "Evening Theta complete" })).toBeVisible();
  await expect(page.getByText("Session #1 this week")).toBeVisible();
  // The audio stops and the device is released.
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
});

test("a Preset stopped by a Library Play counts, without a completion card", async ({ page }) => {
  const row = await importSession(page);
  await startPreset(page);
  await advanceAudioClock(page, 301);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await playFromLibrary(page, row, "15 min");
  await expect(page.locator(".player").getByRole("heading", { name: "Evening Theta" })).toBeVisible();
  await expect(page.getByText(/^Session #\d+ this week$/)).toHaveCount(0);

  // Sessions shows the goals again, not a completion card.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  await expect(await completePreset(page)).toHaveText("Session #2 this week");
});

test("leaving the page ends the running Play there, with its credit", async ({ page }) => {
  await startPreset(page);
  await advanceAudioClock(page, 301);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await expect(page.getByText("Session #1 this week")).toBeVisible();
  // The audio stops and the device is released.
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
});

test("a wall-clock jump is not listening: the timer and credit follow the audio clock", async ({
  page,
}) => {
  await startPreset(page);
  // Ten minutes pass on the wall clock (timers fire, the page repaints), as
  // when a frozen page thaws, but the audio clock only moved in real time.
  await page.clock.fastForward("10:00");
  await expect(page.locator(".timer")).toHaveText(/^14:\d\d$/);
  await page.locator(".player-stage").click(); // reveal controls after inactivity
  await endPlay(page);
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
});

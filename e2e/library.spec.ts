import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  advanceAudioClock,
  audioStates,
  endPlay,
  openSessions,
  recordAudioContexts,
  setUpPreset,
} from "./helpers";

/** A saved Studio session, as an exported .swarasanti.json file. */
const EVENING_THETA = {
  version: 1,
  id: "evening-theta",
  name: "Evening Theta",
  curve: { startHz: 10, targetHz: 6, endHz: null, rampInMin: 5, rampOutMin: 0 },
  layers: [
    {
      id: "layer-1",
      type: "binaural",
      carrierHz: 200,
      beatMode: "follow",
      fixedBeatHz: 6,
      gain: 0.6,
    },
  ],
  createdAt: "2026-09-20T10:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  // A Wednesday noon: every test stays inside one Monday–Sunday week. The wall
  // clock runs on its own; time heard is moved on the audio clock only.
  await page.clock.install({ time: new Date("2026-09-23T12:00:00") });
  await recordAudioContexts(page);
  await openSessions(page);
});

/** Import Evening Theta into the Library and return its row. */
async function importSession(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "evening-theta.swarasanti.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(EVENING_THETA)),
  });
  return page.locator(".library-item", { hasText: "Evening Theta" });
}

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

test("a saved Studio session stopped after 5 minutes counts toward the weekly streak", async ({
  page,
}) => {
  const row = await importSession(page);
  await row.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  const time = row.locator(".transport-time");
  await expect(time).not.toHaveText("30:00");

  // Leaving the Library and coming back keeps the running Play's transport.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(row.getByRole("button", { name: /Stop/ })).toBeVisible();

  await advanceAudioClock(page, 301);
  await expect(time).toHaveText(/^2[45]:\d\d$/);
  await row.getByRole("button", { name: /Stop/ }).click();
  await expect(row.getByRole("button", { name: /Play/ })).toBeVisible();

  await expect(await completePreset(page)).toHaveText("Session #2 this week");
});

test("a saved Studio session stopped before 5 minutes does not count", async ({ page }) => {
  const row = await importSession(page);
  await row.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await advanceAudioClock(page, 270);
  await row.getByRole("button", { name: /Stop/ }).click();

  await expect(await completePreset(page)).toHaveText("Session #1 this week");
});

test("a Preset stopped by a Library Play counts, without leaving the Library", async ({
  page,
}) => {
  const row = await importSession(page);
  await startPreset(page);
  await advanceAudioClock(page, 301);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await row.getByRole("button", { name: /Play/ }).click();
  await expect(row.getByRole("button", { name: /Stop/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  // Sessions shows the goals again, not the Player or a completion card.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await row.getByRole("button", { name: /Stop/ }).click();

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

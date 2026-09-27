import { expect, test } from "@playwright/test";
import { audioStates, openSessions, recordAudioContexts, setUpPreset } from "./helpers";

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

test("a Custom Audio Play stopped after 5 minutes counts toward the weekly streak", async ({
  page,
}) => {
  // A Wednesday noon: the whole test stays inside one Monday–Sunday week.
  await page.clock.install({ time: new Date("2026-09-23T12:00:00") });
  await recordAudioContexts(page);
  await openSessions(page);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "evening-theta.swarasanti.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(EVENING_THETA)),
  });
  const row = page.locator(".library-item", { hasText: "Evening Theta" });
  await row.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  const time = row.locator(".transport-time");
  await expect(time).not.toHaveText("30:00");

  // Leaving the Library and coming back keeps the running Play's transport.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(row.getByRole("button", { name: /Stop/ })).toBeVisible();

  await page.clock.fastForward("05:01");
  await expect(time).toHaveText(/^2[45]:\d\d$/);
  await row.getByRole("button", { name: /Stop/ }).click();
  await expect(row.getByRole("button", { name: /Play/ })).toBeVisible();

  // A Preset credited afterwards shows both completed sessions this week.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".timer")).not.toHaveText("15:00");
  await page.clock.fastForward("05:01");
  await page.getByRole("button", { name: /End Session/ }).click();
  await expect(page.getByText("Session #2 this week")).toBeVisible();
});

test("a Custom Audio Play stopped before 5 minutes does not count", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-23T12:00:00") });
  await recordAudioContexts(page);
  await openSessions(page);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "evening-theta.swarasanti.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(EVENING_THETA)),
  });
  const row = page.locator(".library-item", { hasText: "Evening Theta" });
  await row.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.clock.fastForward("04:30");
  await row.getByRole("button", { name: /Stop/ }).click();

  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".timer")).not.toHaveText("15:00");
  await page.clock.fastForward("05:01");
  await page.getByRole("button", { name: /End Session/ }).click();
  await expect(page.getByText("Session #1 this week")).toBeVisible();
});

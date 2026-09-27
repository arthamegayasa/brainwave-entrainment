import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  audioStates,
  liveFrequencies,
  openSessions,
  openStudio,
  recordAudioContexts,
  recordLiveOutput,
} from "./helpers";

/** Right-channel frequency of the one binaural layer: Carrier + live Beat. */
async function rightHz(page: Page, expected: number): Promise<number> {
  return (await liveFrequencies(page, [200, expected]))[1];
}

test("a Journey edit during a Studio preview waits for Restart preview, which plays it", async ({ page }) => {
  await recordAudioContexts(page);
  await recordLiveOutput(page);
  await openSessions(page);
  await openStudio(page);
  // Leave the default binaural layer alone: left = 200 Hz Carrier, right = Carrier + Beat.
  await page.getByRole("button", { name: "Remove layer 2" }).click();
  await page.locator(".builder-transport").getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.waitForTimeout(1800); // full fade-in and at least one complete FFT frame
  expect(Math.abs((await rightHz(page, 210)) - 210)).toBeLessThanOrEqual(0.1);

  const start = page.getByRole("spinbutton", { name: "Start Beat (Hz)" });
  await start.fill("12");
  await start.blur();
  const stale = page.getByText("The preview keeps the journey it started with.");
  await expect(stale).toBeVisible();
  expect(Math.abs((await rightHz(page, 210)) - 210)).toBeLessThanOrEqual(0.1);

  await page.getByRole("button", { name: "Restart preview" }).click();
  await expect(stale).toHaveCount(0);
  await page.waitForTimeout(1800);
  expect(Math.abs((await rightHz(page, 212)) - 212)).toBeLessThanOrEqual(0.1);
});

test("a Studio design needs a layer to play or save, and holds at most 12", async ({ page }) => {
  await openSessions(page);
  await openStudio(page);
  const play = page.locator(".builder-transport").getByRole("button", { name: /Play/ });
  const saveButtons = [
    page.getByRole("button", { name: "Save", exact: true }),
    page.getByRole("button", { name: "Save on this device" }),
    page.getByRole("button", { name: "Export", exact: true }),
  ];
  await page.getByRole("button", { name: "Remove layer 2" }).click();
  await page.getByRole("button", { name: "Remove layer 1" }).click();
  await expect(page.getByText("No layers yet.")).toBeVisible();
  await expect(play).toBeDisabled();
  for (const button of saveButtons) await expect(button).toBeDisabled();

  const add = page.getByRole("group", { name: "Add a layer" });
  for (let i = 0; i < 12; i++) await add.getByRole("button", { name: "Add Rain layer" }).click();
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(add.getByText("A session holds up to 12 layers.")).toBeVisible();
  for (const button of await add.getByRole("button").all()) await expect(button).toBeDisabled();
  await expect(play).toBeEnabled();
  for (const button of saveButtons) await expect(button).toBeEnabled();
});

test("a typed Beat outside 0.5–50 Hz is clamped when the field is left", async ({ page }) => {
  await openSessions(page);
  await openStudio(page);
  const target = page.getByRole("spinbutton", { name: "Target Beat (Hz)" });
  await target.fill("80");
  await target.blur();
  await expect(target).toHaveValue("50");
  await target.fill("0");
  await target.blur();
  await expect(target).toHaveValue("0.5");
});

test("opening a saved session during a Studio preview stops the preview", async ({ page }) => {
  await recordAudioContexts(page);
  await openSessions(page);
  await openStudio(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const transport = page.locator(".builder-transport");
  await transport.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);

  await page.getByRole("button", { name: "Open My Custom Session" }).click();
  await expect(page.getByText("Session loaded ✓")).toBeVisible();
  await expect(transport.getByRole("button", { name: /Play/ })).toBeVisible();
  await expect(transport.getByRole("button", { name: /Stop/ })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  advanceAudioClock,
  audioStates,
  importSession,
  openSessions,
  recordAudioContexts,
  setUpPreset,
} from "./helpers";

/** Start Meditating for 15 minutes from Sessions; the Player opens. */
async function startPreset(page: Page): Promise<void> {
  await recordAudioContexts(page);
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".player")).toBeVisible();
}

const miniPlayer = (page: Page) => page.getByRole("complementary", { name: "Mini-player" });

test("⌄ minimizes the Player; the Play keeps playing in the Mini-player on other views", async ({ page }) => {
  await startPreset(page);
  const mini = miniPlayer(page);
  await expect(mini).toHaveCount(0);

  await page.getByRole("button", { name: "Minimize Player" }).click();
  await expect(page.locator(".player")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  await expect(mini).toBeVisible();
  await expect(mini).toContainText("Meditating");
  await expect(mini.locator("img")).toHaveAttribute("src", "/scenes/deep-meditation-768.webp");
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  // Time left in the Play, not time heard.
  await advanceAudioClock(page, 120);
  await expect(mini.getByText(/^12:\d\d$/)).toBeVisible();

  for (const view of ["Library", "Science", "Premium"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(mini).toBeVisible();
  }
  // Sessions shows the goals: the Mini-player is the way back to the Player.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  await expect(mini).toBeVisible();
  await page.getByRole("button", { name: "SwaraSanti home" }).click();
  await expect(page.getByRole("button", { name: "Start a Free Session" })).toBeVisible();
  await expect(mini).toHaveCount(0);
  expect(await audioStates(page)).toEqual(["running"]);
});

test("the Mini-player pauses and resumes the Play in place and opens the Player; it has no Stop", async ({
  page,
}) => {
  await startPreset(page);
  await page.getByRole("button", { name: "Minimize Player" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const mini = miniPlayer(page);
  await expect(mini.getByRole("button")).toHaveCount(2);
  await expect(mini.getByRole("button", { name: /Stop|End/ })).toHaveCount(0);

  await mini.getByRole("button", { name: "Pause Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect(mini).toContainText("Paused");
  const time = mini.locator(".mini-player-time");
  const heldAt = await time.textContent();
  await page.waitForTimeout(2000);
  await expect(time).toHaveText(heldAt ?? "");

  await mini.getByRole("button", { name: "Resume Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(time).not.toHaveText(heldAt ?? "");

  await mini.getByRole("button", { name: "Open Meditating" }).click();
  await expect(page.locator(".player")).toBeVisible();
  await expect(mini).toHaveCount(0);
  // ⌄ returns to the view the Player was opened from.
  await page.getByRole("button", { name: "Minimize Player" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
});

test("a device-held Play shows in the Mini-player and resumes from it; no top banner appears", async ({
  page,
}) => {
  await startPreset(page);
  await page.getByRole("button", { name: "Minimize Player" }).click();
  await page.getByRole("button", { name: "Science", exact: true }).click();
  const mini = miniPlayer(page);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);

  // A call takes audio focus: the OS pauses the silent media element, and
  // only a User gesture on SwaraSanti's resume control brings the Play back.
  await page.evaluate(() => document.querySelector("audio")?.pause());
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  const resume = mini.getByRole("button", { name: "Tap to resume" });
  await expect(resume).toBeVisible();
  await expect(mini).toContainText("Audio held by device");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume audio" })).toHaveCount(0);

  await resume.click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(mini.getByRole("button", { name: "Pause Play" })).toBeVisible();
});

test("Back closes an open sheet, then minimizes the Player, and never ends the Play", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startPreset(page);
  const mini = miniPlayer(page);
  await page.getByRole("button", { name: "Mixer", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mixer" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".player")).toBeVisible();

  await page.goBack();
  await expect(page.locator(".player")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  await expect(mini).toBeVisible();
  const bar = await mini.boundingBox();
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(844);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(page.getByText(/^Session #\d+ this week$/)).toHaveCount(0);

  // A sheet closed on screen leaves no entry behind: the next Back minimizes.
  await mini.getByRole("button", { name: "Open Meditating" }).click();
  await page.getByRole("button", { name: "Ambient", exact: true }).click();
  await page.getByRole("dialog", { name: "Ambient" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator(".player")).toHaveCount(0);
  await expect(mini).toBeVisible();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
});

test("a Custom Audio Play shows in the Mini-player, which opens its Library row", async ({ page }) => {
  await recordAudioContexts(page);
  await openSessions(page);
  const row = await importSession(page);
  await row.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.getByRole("button", { name: "Science", exact: true }).click();
  const mini = miniPlayer(page);
  await expect(mini).toContainText("Evening Theta");

  await mini.getByRole("button", { name: "Open Evening Theta" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(row.getByRole("button", { name: /Stop/ })).toBeVisible();
});

test("a device-held Studio preview offers Tap to resume in its transport, without a Mini-player", async ({
  page,
}) => {
  await recordAudioContexts(page);
  await openSessions(page);
  await page.evaluate(() => localStorage.setItem("serenade.role.override", "clinician"));
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  const transport = page.locator(".builder-transport");
  await transport.getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  const resume = transport.getByRole("button", { name: "Tap to resume" });
  await expect(resume).toHaveCount(0);

  await page.evaluate(() => document.querySelector("audio")?.pause());
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect(resume).toBeVisible();
  await expect(miniPlayer(page)).toHaveCount(0);

  await resume.click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(resume).toHaveCount(0);
  await expect(transport.getByRole("button", { name: /Stop/ })).toBeVisible();
});

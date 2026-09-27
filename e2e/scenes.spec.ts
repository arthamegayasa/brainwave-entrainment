import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import {
  EVENING_THETA,
  audioStates,
  importSession,
  libraryRow,
  openSessions,
  openStudio,
  playFromLibrary,
  recordAudioContexts,
  recordMediaControls,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await recordAudioContexts(page);
  await recordMediaControls(page);
  await openSessions(page);
});

/** Save the Studio design as a saved session named `name`. */
async function saveInStudio(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "Session name" }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
}

/** The session JSON a download carries. */
async function exported(download: Promise<Download>): Promise<Record<string, unknown>> {
  return JSON.parse(readFileSync(await (await download).path(), "utf8"));
}

/** The running Play shows `sceneId` in the Player and Media controls, then in the Mini-player once minimized. */
async function expectPlayingScene(page: Page, sceneId: string): Promise<void> {
  await expect(page.locator(".player .scene-art")).toHaveAttribute("data-scene", sceneId);
  expect(await page.evaluate(() => window.__mediaControls.metadata?.artwork[0]?.src)).toMatch(
    new RegExp(`/scenes/${sceneId}-768\\.webp$`),
  );
  await page.getByRole("button", { name: "Minimize Player" }).click();
  await expect(page.getByRole("complementary", { name: "Mini-player" }).locator("img")).toHaveAttribute(
    "src",
    `/scenes/${sceneId}-768.webp`,
  );
}

test("a Scene picked in the Studio shows in the Library, the Player, the Mini-player, and Media controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  const picker = page.getByRole("group", { name: "Scene" });
  const science = picker.getByRole("group", { name: "Science" });
  await expect(science.locator(".scene-option-label")).toHaveText([
    "Neuron Grove",
    "Synapse Light",
    "Mind Constellation",
    "Sound to Mind",
    /^Brainwave Ribbons/,
  ]);
  // Nothing picked yet: the default Scene.
  await expect(science.getByRole("radio", { name: /^Brainwave Ribbons/ })).toBeChecked();
  await science.getByRole("radio", { name: "Neuron Grove" }).check();
  await saveInStudio(page, "Grove Evening");

  await page.getByRole("button", { name: "Library", exact: true }).click();
  const row = libraryRow(page, "Grove Evening");
  await expect(row.locator("img")).toHaveAttribute("src", "/scenes/neuron-grove-768.webp");

  await playFromLibrary(page, row, "15 min");
  await expectPlayingScene(page, "neuron-grove");
});

test("the Studio stores a Scene only when one is picked, so unpicked audio follows the default", async ({ page }) => {
  await openStudio(page);
  await saveInStudio(page, "Plain Theta");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const row = libraryRow(page, "Plain Theta");
  await expect(row.locator("img")).toHaveAttribute("src", "/scenes/brainwave-ribbons-768.webp");
  const plain = page.waitForEvent("download");
  await row.getByRole("button", { name: "Export" }).click();
  expect(await exported(plain)).not.toHaveProperty("sceneId");

  await page.getByRole("button", { name: "Studio", exact: true }).click();
  const picker = page.getByRole("group", { name: "Scene" });
  await picker.getByRole("radio", { name: "Aurora Lake" }).check();
  const picked = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect(await exported(picked)).toMatchObject({ sceneId: "creativity" });

  // Picking the Default again goes back to following the default.
  await picker.getByRole("radio", { name: /^Brainwave Ribbons/ }).check();
  const unpicked = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect(await exported(unpicked)).not.toHaveProperty("sceneId");
});

test("a Scene picked during a Studio preview shows in its Media controls", async ({ page }) => {
  await openStudio(page);
  await page.locator(".builder-transport").getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  const artwork = () => page.evaluate(() => window.__mediaControls.metadata?.artwork[0]?.src);
  expect(await artwork()).toMatch(/\/scenes\/brainwave-ribbons-768\.webp$/);
  await page.getByRole("group", { name: "Scene" }).getByRole("radio", { name: "Aurora Lake" }).check();
  expect(await artwork()).toMatch(/\/scenes\/creativity-768\.webp$/);
});

test("Custom Audio saved without a Scene, or with an unknown one, shows Brainwave Ribbons everywhere", async ({
  page,
}) => {
  // Saved before Brainwave Ribbons was painted: stored specs never hold the default.
  await page.evaluate(
    (session) => localStorage.setItem("serenade.customSessions.v1", JSON.stringify([session])),
    EVENING_THETA,
  );
  const unknown = await importSession(page, {
    ...EVENING_THETA,
    id: "dawn",
    name: "Dawn Theta",
    sceneId: "no-such-scene",
  });
  const saved = libraryRow(page, "Evening Theta");
  for (const row of [saved, unknown]) {
    await expect(row.locator("img")).toHaveAttribute("src", "/scenes/brainwave-ribbons-768.webp");
  }

  await playFromLibrary(page, saved, "15 min");
  await expectPlayingScene(page, "brainwave-ribbons");
});

test("a session file keeps its Scene when imported into the Studio", async ({ page }) => {
  await openStudio(page);
  await page.locator('.builder input[type="file"]').setInputFiles({
    name: "dawn.swarasanti.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...EVENING_THETA, name: "Dawn", sceneId: "focus" })),
  });
  await expect(page.getByRole("group", { name: "Scene" }).getByRole("radio", { name: "Dawn Hills" })).toBeChecked();
});

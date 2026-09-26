import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openSessions, setUpPreset } from "./helpers";

test("a preset downloads as a full-length 320 kbps MP3", async ({ page }) => {
  // A real 15-minute offline render + encode.
  test.setTimeout(240_000);
  await openSessions(page);
  await setUpPreset(page, "Meditating", "15 min");

  const downloadButton = page.getByRole("button", { name: /Download as MP3/ });
  const download = page.waitForEvent("download", { timeout: 220_000 });
  await downloadButton.click();
  await expect(page.getByRole("button", { name: /Rendering|Encoding/ })).toBeDisabled();

  const file = await download;
  expect(file.suggestedFilename()).toBe("SwaraSanti-Meditating-15-min-headphones.mp3");
  const bytes = statSync(await file.path()).size;
  const expected = (15 * 60 * 320_000) / 8; // CBR: duration × bitrate
  expect(Math.abs(bytes - expected) / expected).toBeLessThan(0.01);
  await expect(downloadButton).toBeEnabled();
});

test("an infinite session cannot be downloaded", async ({ page }) => {
  await openSessions(page);
  await setUpPreset(page, "Meditating", "∞");
  await expect(page.getByRole("button", { name: /Download as MP3/ })).toBeDisabled();
  await expect(page.getByText("infinite sessions play live only")).toBeVisible();
});

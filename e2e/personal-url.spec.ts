import { expect, test } from "@playwright/test";

test("a Personal URL deep link loads the app, not a 404", async ({ page }) => {
  const response = await page.goto("/p/ivan-moon");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("button", { name: "Serenade home" })).toBeVisible();
  // The path opens the Personal URL page rather than the homepage.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a Free Session" })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/p/ivan-moon");
});

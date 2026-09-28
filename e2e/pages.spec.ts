import { expect, test } from "@playwright/test";

const landing = /quiet horizon/;
const science = "The science behind SwaraSanti";

test("each page has its own address and tab title; Back, Forward, and a reload keep to them", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Science", exact: true }).click();
  await expect(page).toHaveURL(/\/science$/);
  await expect(page).toHaveTitle("Science — SwaraSanti");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page).toHaveTitle("Library — SwaraSanti");

  await page.goBack();
  await expect(page.getByRole("heading", { name: science })).toBeVisible();
  await expect(page).toHaveURL(/\/science$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: landing })).toBeVisible();
  await expect(page).toHaveTitle("SwaraSanti — Healing Audio for Relaxation, Sleep & Focus");
  await page.goForward();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
});

test("a Clinician page opened without Clinician powers moves to the Library, and Back skips it", async ({
  page,
}) => {
  await page.goto("/science");
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/science$/);
  await expect(page.getByRole("heading", { name: science })).toBeVisible();
});

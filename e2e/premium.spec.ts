import { expect, test } from "@playwright/test";

for (const width of [390, 800, 1280]) {
  test(`plan cards share the width evenly and nothing overflows at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Premium", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Unlock your full potential" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>(".plans.three > .plan")];
      const parts = [...document.querySelectorAll<HTMLElement>(".plans.three .plan, .plan-price")];
      return {
        widths: cards.map((card) => card.getBoundingClientRect().width),
        overflowing: parts.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      };
    });
    expect(layout.widths).toHaveLength(3);
    expect(Math.max(...layout.widths) - Math.min(...layout.widths)).toBeLessThan(1);
    expect(layout.overflowing).toBe(0);
  });
}

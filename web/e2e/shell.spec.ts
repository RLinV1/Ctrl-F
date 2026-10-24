import { expect, test } from "@playwright/test";

for (const [path, current] of [
  ["/", "Ask"],
  ["/items", "Items"],
  ["/items/item-keys", "Items"],
  ["/history", "History"],
] as const) {
  test(`the shell and navigation render on ${path}`, async ({ page }) => {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Ask" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Items" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "History" })).toBeVisible();
    await expect(nav.getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("on a phone the menu opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#mobile-menu").getByRole("link", { name: "Items" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.locator("#mobile-menu")).toHaveCount(0);
});

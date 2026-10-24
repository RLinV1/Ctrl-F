import { expect, test } from "@playwright/test";

test("history shows the newest sighting large and loads older ones in place", async ({ page }) => {
  await page.goto("/items/item-wallet");
  await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Newest sighting" })).toBeVisible();
  await expect(page.locator("[data-frame]")).toHaveCount(12);
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.getByRole("button", { name: "Load older sightings" }).click();
  await expect(page.locator("[data-frame]")).toHaveCount(20);
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  await expect(page.getByText("That is every sighting on record.")).toBeVisible();
});

test("choosing a frame shows it large", async ({ page }) => {
  await page.goto("/items/item-wallet");
  await page.locator("[data-frame]").nth(3).click();
  await expect(page.getByRole("heading", { name: "Sighting", exact: true })).toBeVisible();
  await expect(page.locator("[data-frame]").nth(3)).toHaveAttribute("aria-pressed", "true");
});

test("an unknown item says so", async ({ page }) => {
  await page.goto("/items/nope");
  await expect(page.getByRole("heading", { name: "No such item" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See every item" })).toHaveAttribute("href", "/items");
});

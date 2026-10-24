import { expect, test } from "@playwright/test";

test("History lists what was seen recently and what goes missing most", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  const recent = page.getByRole("region", { name: "Recently seen" });
  await expect(recent.getByRole("listitem").first()).toContainText(/wallet/i);
  await expect(recent).not.toContainText(/watch/i);
  const lost = page.getByRole("region", { name: "Lost most often" });
  await expect(lost.getByRole("listitem").first()).toContainText(/keys/i);
  await expect(lost.getByRole("listitem").first()).toContainText("lost 5 times");
  await lost.getByRole("link", { name: "keys" }).click();
  await expect(page).toHaveURL(/\/items\/item-keys$/);
});

test("Ask no longer shows the count tiles or the lists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("prompt")).toBeVisible();
  await expect(page.getByText("Items tracked")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recently seen" })).toHaveCount(0);
});

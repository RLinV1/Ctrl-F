import { expect, test } from "@playwright/test";

test("a seen item shows when and where, with the exact time on focus", async ({ page }) => {
  await page.goto("/items");
  const wallet = page.locator('[data-item="wallet"]');
  await expect(wallet).toContainText("On the desk");
  await expect(wallet).toContainText("lost 3 times");
  await expect(wallet.getByRole("img", { name: "wallet marked" })).toBeVisible();
  const time = wallet.locator("time");
  await expect(time).toHaveAttribute("aria-label", /min ago, /);
  await time.focus();
  await expect(time.locator("span[aria-hidden]").last()).toHaveCSS("opacity", "1");
});

test("a never-seen item says so and prints a zero", async ({ page }) => {
  await page.goto("/items");
  const watch = page.locator('[data-item="watch"]');
  await expect(watch).toContainText("Not seen yet");
  await expect(watch).toContainText("never lost");
  await expect(watch).toContainText("No photo yet");
});

test("items are ordered newest first, never-seen last", async ({ page }) => {
  await page.goto("/items");
  const names = await page.locator("[data-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-item")));
  expect(names[0]).toBe("wallet");
  expect(names.at(-1)).toBe("watch");
});

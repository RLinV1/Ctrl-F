import { expect, test } from "@playwright/test";
import { stubStatus } from "./fixtures";

test("the status area shows both devices in words", async ({ page }) => {
  await page.goto("/items");
  const status = page.getByRole("region", { name: "Status" });
  await expect(status).toContainText("Camera online");
  await expect(status).toContainText("Desktop online");
});

test("the camera going offline shows within one refresh, with since when", async ({ page }) => {
  await page.goto("/items");
  const status = page.getByRole("region", { name: "Status" });
  await expect(status).toContainText("Camera online");
  await stubStatus(page, false);
  await expect(status).toContainText(/Camera offline since \d\d:\d\d/, { timeout: 15_000 });
  await expect(status).toContainText("Camera offline");
});

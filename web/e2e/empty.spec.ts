import { expect, test } from "@playwright/test";

test("with nothing tracked, Items explains why and keeps its layout", async ({ page }) => {
  await page.goto("/items");
  await expect(page.getByRole("heading", { name: "Where everything was last seen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing tracked yet" })).toBeVisible();
  await expect(page.getByText(/classes the camera's model is trained on/)).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { hydrated } from "./fixtures";

test("the switch offers three ways to ask, speaking first", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const modes = page.getByRole("navigation", { name: "How to ask" });
  await expect(modes.getByRole("button", { name: "Speak here" })).toHaveAttribute("aria-pressed", "true");
  await expect(modes.getByRole("button", { name: "Type it" })).toHaveAttribute("aria-pressed", "false");
  await expect(modes.getByRole("button", { name: "Camera button" })).toHaveAttribute("aria-pressed", "false");
});

test("typing a question gets an answer for the item named", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("button", { name: "Type it" }).click();
  await expect(page.getByTestId("talk")).toHaveCount(0);
  const ask = page.getByRole("button", { name: "Ask", exact: true });
  await expect(ask).toBeDisabled();
  await page.getByLabel("What are you looking for?").fill("where are my glasses");
  await ask.click();
  const answer = page.getByTestId("answer");
  await expect(answer).toContainText("You asked: “where are my glasses”", { timeout: 15_000 });
  await expect(answer).toContainText("Your glasses rest upon the desk");
  await expect(page.getByTestId("found")).toBeVisible();
});

test("the camera button mode answers a press from the camera", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("button", { name: "Camera button" }).click();
  const panel = page.getByTestId("camera-button");
  await expect(panel).toContainText("Listening for the camera button");
  await panel.getByRole("button", { name: /Simulate a button press/ }).click();
  await expect(page.getByTestId("answer")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("document", { name: "Answer slip" })).toContainText("Asked:");
});

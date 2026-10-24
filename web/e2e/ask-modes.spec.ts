import { expect, test } from "@playwright/test";
import { chooseMode, hydrated, typeQuestion } from "./fixtures";

test("the prompt offers three ways to ask, typing first", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await expect(page.getByRole("button", { name: "How to ask: Type it" })).toBeVisible();
  await page.getByRole("button", { name: /How to ask/ }).click();
  for (const name of ["Speak here", "Type it", "Camera button"]) {
    await expect(page.getByRole("menuitem", { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByText("Model")).toHaveCount(0);
});

test("typing a question gets an answer for the item named", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await expect(page.getByTestId("send")).toBeDisabled();
  await typeQuestion(page, "where are my glasses");
  const answer = page.getByTestId("answer");
  await expect(answer).toContainText("You asked: “where are my glasses”", { timeout: 15_000 });
  await expect(answer).toContainText("Your glasses rest upon the desk");
  await expect(page.getByTestId("found")).toBeVisible();
});

test("speak here swaps Send for the hold-to-talk button", async ({ page }) => {
  await page.goto("/");
  await chooseMode(page, "Speak here");
  await expect(page.getByTestId("talk")).toBeVisible();
  await expect(page.getByTestId("send")).toHaveCount(0);
  await expect(page.getByLabel("What are you looking for?")).toHaveCount(0);
});

test("the camera button mode answers a press from the camera", async ({ page }) => {
  await page.goto("/");
  await chooseMode(page, "Camera button");
  await expect(page.getByTestId("camera-button")).toContainText("Listening for the camera button");
  await page.getByRole("button", { name: "Simulate a press" }).click();
  await expect(page.getByTestId("answer")).toBeVisible({ timeout: 15_000 });
});

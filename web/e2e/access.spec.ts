import { expect, test } from "@playwright/test";
import { TEST_PASSWORD, TEST_PI_TOKEN } from "./fixtures";

test("signed out, a screen sends you to sign in and back afterwards", async ({ page }) => {
  await page.goto("/items");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fitems/);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByRole("heading", { name: "Where everything was last seen" })).toBeVisible();
});

test("a wrong password says so and sets no session", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill("not it");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#password-error")).toHaveText("That password is wrong.");
  expect((await page.context().cookies()).find((c) => c.name === "ctrlf_session")).toBeUndefined();
});

test("sign out ends the session", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("API routes answer 401 without a session, even with the Pi token", async ({ request }) => {
  expect((await request.get("/api/items")).status()).toBe(401);
  const withPi = await request.get("/api/items", { headers: { authorization: `Bearer ${TEST_PI_TOKEN}` } });
  expect(withPi.status()).toBe(401);
});

test("the Pi endpoint ignores the gate and checks its own token", async ({ request }) => {
  expect((await request.get("/api/jobs/next")).status()).toBe(401);
  const pi = await request.get("/api/jobs/next", { headers: { authorization: `Bearer ${TEST_PI_TOKEN}` } });
  expect([200, 204]).toContain(pi.status());
});

test("the camera's upload endpoint skips the gate and checks the Pi token", async ({ request }) => {
  const audio = { "content-type": "audio/webm" };
  expect((await request.post("/api/device/jobs", { headers: audio, data: Buffer.from([1, 2, 3]) })).status()).toBe(401);
  const res = await request.post("/api/device/jobs", {
    headers: { ...audio, authorization: `Bearer ${TEST_PI_TOKEN}` },
    data: Buffer.from([1, 2, 3]),
  });
  expect(res.status()).toBe(201);
});

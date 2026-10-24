import { expect, test } from "@playwright/test";
import { chooseMode, expectGreeting, foundWallet, hold, job, replies, sighting, stubJob, stubMediaClock, stubStatus, typeQuestion } from "./fixtures";
import { GREETINGS } from "../lib/greetings";

test.describe("push-to-talk", () => {
  test("hold and release sends the question and shows an answer", async ({ page }) => {
    await page.goto("/");
    await hold(page, 1500);
    await expect(page.locator('[data-phase="sending"], [data-phase="waiting"]')).toBeVisible();
    await expect(page.getByText(/Sending your question|Waiting for the camera|Looking for it/)).toBeVisible();
    await expect(page.getByTestId("answer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/You asked: “/)).toBeVisible();
  });

  test("Space held on the control records and sends", async ({ page }) => {
    await page.goto("/");
    await chooseMode(page, "Speak here");
    await page.getByTestId("talk").focus();
    await page.keyboard.down(" ");
    await expect(page.getByTestId("talk")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1200);
    await page.keyboard.up(" ");
    await expect(page.locator('[data-phase="sending"], [data-phase="waiting"], [data-phase="answered"]')).toBeVisible();
  });

  test("a hold that is too short sends nothing", async ({ page }) => {
    let created = 0;
    page.on("request", (r) => r.url().endsWith("/api/jobs") && r.method() === "POST" && created++);
    await page.goto("/");
    await hold(page, 150);
    await expect(page.getByText("Hold the button down while you speak, then let go.")).toBeVisible();
    expect(created).toBe(0);
  });

  test("a blocked microphone disables the control and leaves Items working", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d: PermissionDescriptor) =>
        d.name === ("microphone" as PermissionName)
          ? Promise.resolve({ state: "denied", onchange: null } as unknown as PermissionStatus)
          : query(d);
    });
    await page.goto("/");
    await chooseMode(page, "Speak here");
    await expect(page.getByTestId("talk")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("alert").filter({ hasText: "The microphone is blocked" })).toBeVisible();
    await page.getByRole("alert").getByRole("link", { name: "Items" }).click();
    await expect(page.getByRole("heading", { name: "Where everything was last seen" })).toBeVisible();
  });
});

test.describe("while the job runs", () => {
  test("shows that the camera has the request", async ({ page }) => {
    await stubJob(page, job({ status: "claimed", claimedAt: new Date().toISOString() }));
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByText("The camera has a photo. Looking for it…")).toBeVisible();
    await expect(page.getByRole("img", { name: "Working on it" })).toBeVisible();
  });

  test("the cogs run while the job is worked on", async ({ page }, info) => {
    test.skip(info.project.name === "reduced-motion", "cogs stand still under reduced motion");
    await stubJob(page, job({ status: "claimed", claimedAt: new Date().toISOString() }));
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByRole("img", { name: "Working on it" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.getAnimations().filter((x) => (x.effect as KeyframeEffect | null)?.target?.hasAttribute("data-cog")).length,
        ),
      )
      .toBeGreaterThan(0);
  });

  test("says the camera is offline when the job goes stale", async ({ page }) => {
    await stubJob(page, job({ status: "pending", stale: true }));
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByText("The camera has not picked this up.")).toBeVisible();
  });

  test("says when processing failed", async ({ page }) => {
    await stubJob(page, job({ status: "failed", error: "Speech-to-text failed." }));
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByText("That request failed.")).toBeVisible();
    await expect(page.getByText("Speech-to-text failed.")).toBeVisible();
  });

  test("warns beside the control when a device is offline", async ({ page }) => {
    await stubStatus(page, false);
    await page.goto("/");
    await expect(page.getByTestId("offline-warning")).toContainText("The camera is offline");
    // Asking still works; the question waits for the camera.
    await page.getByLabel("What are you looking for?").fill("where is my wallet");
    await expect(page.getByTestId("send")).toBeEnabled();
  });
});

test.describe("the answer", () => {
  test("found: the reply, the marked photo, the name and confidence as text", async ({ page }) => {
    await stubJob(page, foundWallet());
    await page.goto("/");
    await hold(page, 900);
    const found = page.getByTestId("found");
    await expect(found).toBeVisible();
    await page.getByTestId("next").click();
    await expect(found.getByRole("img", { name: "wallet marked", exact: true })).toBeVisible();
    await expect(page.getByTestId("found-caption")).toContainText("91% sure");
    await expect(page.getByTestId("found-caption")).toContainText("on the desk");
    await expect(page.getByTestId("answer")).toContainText(replies["reply-wallet"].text.split(" ").slice(0, 3).join(" "));
    await expect(page.getByTestId("reply-play")).toBeVisible();
  });

  test("marks the word being spoken", async ({ page }) => {
    await stubMediaClock(page);
    await stubJob(page, foundWallet());
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByTestId("answer")).toBeVisible();
    const at = 2.1;
    const expected = replies["reply-wallet"].timings.filter((t) => t.start <= at).at(-1)!.word;
    await page.evaluate((t) => {
      (window as unknown as { __t: number }).__t = t;
    }, at);
    await expect(page.locator("[data-current]")).toHaveText(expected);

  });

  test("autoplay blocked: the text shows and play starts it", async ({ page }) => {
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("no", "NotAllowedError"));
    });
    await stubJob(page, foundWallet());
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByText("Press play to hear the answer.")).toBeVisible();
    await expect(page.getByTestId("reply-play")).toBeVisible();
  });

  test("without audio: text only, no play control", async ({ page }) => {
    await stubJob(page, foundWallet({ replyAudioUrl: null, replyTimings: null }));
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByTestId("answer")).toBeVisible();
    await expect(page.getByTestId("reply-play")).toHaveCount(0);
  });

  test("not found: shows the last sighting and links to history", async ({ page }) => {
    await stubJob(
      page,
      job({ status: "done", transcript: "Have you seen my keys?", target: "keys", itemId: "item-keys", found: false, replyText: replies["reply-keys"].text, lastSighting: sighting() }),
    );
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByTestId("not-found")).toBeVisible();
    await page.getByTestId("next").click();
    const stage = page.getByTestId("stage");
    await expect(stage).toContainText("Not in view · last seen 3 h ago on the side table");
    await expect(stage.getByRole("link", { name: "See where the keys have been" })).toHaveAttribute("href", "/items/item-keys");
  });

  test("never seen: says so", async ({ page }) => {
    await stubJob(page, job({ status: "done", transcript: "Where's my watch?", target: "watch", found: false, replyText: replies["reply-watch"].text }));
    await page.goto("/");
    await hold(page, 900);
    await expect(page.getByTestId("never-seen")).toContainText("has not seen the watch yet");
  });
});

test("reduced motion: every state appears with nothing moving", async ({ page }, info) => {
  test.skip(info.project.name !== "reduced-motion", "reduced-motion project only");
  await stubJob(page, job({ status: "claimed", claimedAt: new Date().toISOString() }));
  await page.goto("/");
  await hold(page, 900);
  await expect(page.getByText("The camera has a photo. Looking for it…")).toBeVisible();
  await expect(page.getByRole("img", { name: "Working on it" })).toBeVisible();
  await page.waitForTimeout(600);
  const cogAnimations = await page.evaluate(
    () => document.getAnimations().filter((x) => (x.effect as KeyframeEffect | null)?.target?.hasAttribute("data-cog")).length,
  );
  expect(cogAnimations).toBe(0);
  await page.unroute(/\/api\/jobs\/(?!next)[^/]+$/);
  await stubJob(page, foundWallet());
  await expect(page.getByTestId("found")).toBeVisible();
  expect(await page.locator("[data-lens-ring]").first().getAttribute("stroke-dasharray")).toBeNull();
  await expect(page.getByTestId("answer")).toBeVisible();
});

test("the camera view stays hidden until a question is asked", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("prompt")).toBeVisible();
  await expect(page.getByTestId("camera-view")).toHaveCount(0);
  await stubJob(page, foundWallet());
  await typeQuestion(page, "where is my wallet");
  await expect(page.getByTestId("camera-view")).toBeAttached();
  await page.getByTestId("next").click();
  await expect(page.getByTestId("found").getByRole("img", { name: "wallet marked", exact: true })).toBeVisible();
});

test("the ▼ skips to the camera's photo, and Narrator brings him back", async ({ page }) => {
  await page.goto("/");
  await stubJob(page, foundWallet());
  await typeQuestion(page, "where is my wallet");
  const photo = page.getByTestId("camera-view");
  // He talks first, in his study.
  await expect(page.getByTestId("answer")).toBeVisible();
  await expect(page.locator("[data-narrator-shown]")).toHaveCount(1);
  await expect(photo).not.toHaveAttribute("data-shown", "true");
  await page.getByRole("button", { name: "Show the camera's photo" }).click();
  await expect(photo).toHaveAttribute("data-shown", "true");
  await expect(page.locator("[data-narrator-shown]")).toHaveCount(0);
  await expect(page.getByTestId("found-caption")).toBeVisible();
  await page.getByTestId("back").click();
  await expect(photo).not.toHaveAttribute("data-shown", "true");
  await expect(page.locator("[data-narrator-shown]")).toHaveCount(1);
});

test("after he finishes talking, the study fades and then the camera view takes over", async ({ page }) => {
  await page.goto("/");
  // No voice: the reply types out, then the sequence runs on its own.
  await stubJob(page, foundWallet({ replyAudioUrl: null, replyTimings: null }));
  await typeQuestion(page, "where is my wallet");
  await expect(page.getByTestId("answer")).toBeVisible();
  await expect(page.locator("[data-narrator-shown]")).toHaveCount(1);
  await expect(page.getByTestId("camera-view")).toHaveAttribute("data-shown", "true", { timeout: 12_000 });
  await expect(page.locator("[data-narrator-shown]")).toHaveCount(0);
  await expect(page.getByTestId("found-caption")).toContainText("on the desk");
});

test("the narrator greets with a line from the pool, the next one on each reload", async ({ page }) => {
  await page.goto("/");
  const first = await expectGreeting(page);
  await page.reload();
  const second = await expectGreeting(page);
  await page.reload();
  const third = await expectGreeting(page);
  const shown = [first, second, third].map((text) => GREETINGS.findIndex((g) => text.includes(g)));
  expect(shown.every((i) => i >= 0)).toBe(true);
  // In turn: each reload shows the line after the previous one.
  expect(shown[1]).toBe((shown[0] + 1) % GREETINGS.length);
  expect(shown[2]).toBe((shown[1] + 1) % GREETINGS.length);
  await expect(page.getByTestId("dialogue")).not.toContainText("last thing seen");
});

test("the Ask page starts fresh after a reload or a visit to another page", async ({ page }) => {
  await page.goto("/");
  await stubJob(page, foundWallet());
  await typeQuestion(page, "where is my wallet");
  await expect(page.getByTestId("answer")).toBeVisible();
  await page.reload();
  await expectGreeting(page);
  await expect(page.getByTestId("answer")).toHaveCount(0);

  await typeQuestion(page, "where is my wallet");
  await expect(page.getByTestId("answer")).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Items" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goBack();
  await expectGreeting(page);
  await expect(page.getByTestId("answer")).toHaveCount(0);
});

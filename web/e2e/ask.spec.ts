import { expect, test } from "@playwright/test";
import { foundWallet, hold, hydrated, job, replies, sighting, stubJob, stubMediaClock, stubStatus } from "./fixtures";

test.describe("push-to-talk", () => {
  test("hold and release sends the question and shows an answer", async ({ page }) => {
    await page.goto("/");
    await hold(page, 1500);
    await expect(page.locator('[data-phase="sending"], [data-phase="waiting"]')).toBeVisible();
    await expect(page.getByText("Request sent")).toBeVisible();
    await expect(page.getByTestId("answer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/You asked: “/)).toBeVisible();
    await expect(page.getByRole("document", { name: "Answer slip" })).toContainText("Asked:");
  });

  test("Space held on the control records and sends", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
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
    await expect(page.getByText("Camera took a photo")).toBeVisible();
    await expect(page.locator("output", { hasText: "Looking for it" })).toBeVisible();
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
    await expect(page.getByTestId("talk")).not.toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("the answer", () => {
  test("found: the reply, the marked photo, the name and confidence as text", async ({ page }) => {
    await stubJob(page, foundWallet());
    await page.goto("/");
    await hold(page, 900);
    const found = page.getByTestId("found");
    await expect(found).toBeVisible();
    await expect(found.getByRole("img", { name: "wallet marked", exact: true })).toBeVisible();
    await expect(found).toContainText("91% sure");
    await expect(found).toContainText("On the desk");
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
    // The narrator in the frame's corner speaks while the reply plays.
    const narrator = page.getByRole("figure").filter({ has: page.getByAltText(/The narrator/) });
    await expect(narrator).toHaveAttribute("data-speaking", "true");
    await expect(narrator).toContainText("Speaking…");
    await page.evaluate(() => document.querySelector("audio")!.dispatchEvent(new Event("pause")));
    await expect(narrator).not.toHaveAttribute("data-speaking", "true");
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
    const notFound = page.getByTestId("not-found");
    await expect(notFound).toContainText("Not in view right now");
    await expect(notFound).toContainText("Last seen 3 h ago on the side table");
    await expect(notFound.getByRole("link", { name: "See where the keys have been" })).toHaveAttribute("href", "/items/item-keys");
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
  await expect(page.locator("output", { hasText: "Looking for it" })).toBeVisible();
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

test("before asking, the camera view shows the latest photo", async ({ page }) => {
  await page.goto("/");
  const view = page.getByTestId("camera-view");
  await expect(view.getByRole("img", { name: "Latest camera photo" })).toBeVisible();
  await expect(view).toContainText("Ask, and the item you name is circled here.");
});

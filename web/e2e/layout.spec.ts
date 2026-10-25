import { expect, test } from "@playwright/test";

// Walnut (#3b2716), the sidebar's leather ground.
const WALNUT = "rgb(59, 39, 22)";

test("the sidebar is walnut with light text", async ({ page, isMobile }) => {
  test.skip(isMobile, "the sidebar shows from the md breakpoint up");
  await page.goto("/");
  const sidebar = page.locator("aside");
  await expect(sidebar).toHaveCSS("background-color", WALNUT);
  // Nav text stays light on the dark leather.
  await expect(sidebar.getByRole("link", { name: "Items" })).toHaveCSS("color", "rgb(205, 185, 148)");
});

test("on a phone the top bar is walnut", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await page.goto("/");
  await expect(page.locator("header")).toHaveCSS("background-color", WALNUT);
});

test("steam fogs the narrator's screen while a question is worked on and clears to reveal the answer", async ({ page }) => {
  // The jobs API is stubbed: the job stays pending until `answered` flips, then comes back found.
  let answered = false;
  const job = {
    id: "job-steam", status: "pending", stale: false, createdAt: new Date().toISOString(), transcript: "Where are my keys?",
    target: "keys", itemId: null, found: null, corrected: false, replyText: null, replyAudioUrl: null, replyPending: false,
    replyTimings: null, photo: null, match: null, lastSighting: null, error: null,
  };
  // No camera-button questions: otherwise a real server would hand over its newest job.
  await page.route("**/api/jobs/latest**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.fulfill({ json: { id: job.id } }) : route.fallback(),
  );
  await page.route(`**/api/jobs/${job.id}`, (route) =>
    route.fulfill({
      json: answered ? { ...job, status: "done", found: true, replyText: "Your keys are on the desk, old chap." } : job,
    }),
  );

  await page.goto("/");
  const frame = page.getByTestId("stage-frame");
  // The steam sits inside the screen, over the scene.
  const steam = frame.getByTestId("steam");
  await expect(steam).toHaveAttribute("data-steam", "off");
  await expect(steam).toBeHidden();

  // Typing before hydration, or while the prompt is busy, is lost: wait until it is ready.
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-live", "true");
  const prompt = page.getByRole("textbox");
  await expect(prompt).toHaveAttribute("placeholder", "Where are my keys?");
  await prompt.fill("Where are my keys?");
  await prompt.press("Enter");
  await expect(frame).toHaveAttribute("data-steaming", "true");
  await expect(steam).toHaveAttribute("data-steam", "on");
  await expect(steam).toBeVisible();
  const screen = (await page.getByTestId("stage").boundingBox())!;
  const fog = (await steam.boundingBox())!;
  expect(fog).toEqual(screen);
  // The dialogue box stays readable above the steam.
  await expect(page.getByTestId("dialogue")).toHaveCSS("z-index", "20");

  answered = true;
  await expect(page.getByTestId("answer")).toContainText("on the desk");
  await expect(frame).not.toHaveAttribute("data-steaming");
  await expect(steam).toHaveAttribute("data-steam", "off");
  await expect(steam).toBeHidden(); // after the fade
});

test("the dialogue box is a riveted brass-framed panel, and the full photo closes back to the narrator", async ({ page }) => {
  // A found answer with the camera's photo; the jobs API and the camera-button watcher are stubbed.
  const job = {
    id: "job-photo", status: "done", stale: false, createdAt: new Date().toISOString(), transcript: "Where are my keys?",
    target: "keys", itemId: null, found: true, corrected: false, replyText: "Your keys are on the desk, old chap.",
    replyAudioUrl: null, replyPending: false, replyTimings: null,
    photo: { id: "photo-1", url: "/narrator.png", width: 400, height: 400, seenAt: new Date().toISOString() },
    match: null, lastSighting: null, error: null,
  };
  await page.route("**/api/jobs/latest**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.fulfill({ json: { id: job.id } }) : route.fallback(),
  );
  await page.route(`**/api/jobs/${job.id}`, (route) => route.fulfill({ json: job }));

  await page.goto("/");
  const dialogue = page.getByTestId("dialogue");
  await expect(dialogue).toHaveCSS("border-top-color", "rgb(168, 119, 42)"); // brass border
  await expect(dialogue).toHaveCSS("outline-style", "solid"); // dark outline round it
  await expect(dialogue.locator(".vn-nameplate")).toHaveText("Narrator");

  await expect(page.getByTestId("prompt")).toHaveAttribute("data-live", "true");
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Where are my keys?");
  await page.getByRole("textbox").fill("Where are my keys?");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("answer")).toContainText("on the desk");

  // Skip ahead to the full photo, then close it with the ✕.
  await page.getByTestId("next").click();
  const close = page.getByRole("button", { name: "Close the photo and return to the narrator" });
  await expect(close).toBeVisible();
  await expect(page.getByTestId("answer")).toHaveCSS("opacity", "0");
  await close.click();
  await expect(close).toBeHidden();
  await expect(page.getByTestId("answer")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("backdrop")).toHaveCSS("opacity", "1"); // back in his study
  await expect(page.getByTestId("next")).toBeVisible(); // and the photo is one click away again
});

test("steam still clearing is wiped off the full photo at once, so no white haze covers it", async ({ page }) => {
  // The answer arrives while the screen is still steamed over; the user opens the photo straight away.
  let answered = false;
  const job = {
    id: "job-haze", status: "pending", stale: false, createdAt: new Date().toISOString(), transcript: "Where are my keys?",
    target: "keys", itemId: null, found: null, corrected: false, replyText: null, replyAudioUrl: null, replyPending: false,
    replyTimings: null, photo: null, match: null, lastSighting: null, error: null,
  };
  const done = {
    ...job, status: "done", found: true, replyText: "Your keys are on the desk, old chap.",
    photo: { id: "photo-haze", url: "/narrator.png", width: 400, height: 400, seenAt: new Date().toISOString() },
  };
  await page.route("**/api/jobs/latest**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.fulfill({ json: { id: job.id } }) : route.fallback(),
  );
  await page.route(`**/api/jobs/${job.id}`, (route) => route.fulfill({ json: answered ? done : job }));

  await page.goto("/");
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-live", "true");
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Where are my keys?");
  await page.getByRole("textbox").fill("Where are my keys?");
  await page.getByRole("textbox").press("Enter");
  const steam = page.getByTestId("steam");
  await expect(steam).toBeVisible();
  await page.waitForTimeout(1500); // the screen fills with steam

  answered = true;
  await expect(page.getByTestId("answer")).toContainText("on the desk");
  await page.getByTestId("next").click();
  await expect(page.getByTestId("close-photo")).toBeVisible();
  // Left alone, the vapour takes about three seconds to thin away; over the photo it must go at once.
  await expect(steam).toBeHidden({ timeout: 1000 });
});

test("the narrator remarks when the photo is taken, and the answer replaces the remark", async ({ page }) => {
  // The job turns claimed (the photo is in) with a remark, then is answered. Gemini and ElevenLabs are stubbed out:
  // the remark audio is not playable, so this also covers a blocked voice, where the words still show.
  let state: "pending" | "claimed" | "done" = "pending";
  const base = {
    id: "job-remark", stale: false, createdAt: new Date().toISOString(), transcript: "Where are my keys?", target: "keys",
    itemId: null, found: null, corrected: false, replyText: null, replyAudioUrl: null, replyPending: false, replyTimings: null,
    photo: null, match: null, lastSighting: null, error: null, remark: null,
  };
  const remark = { text: "Hold quite still, keys, the lens has you now.", audioUrl: "/api/jobs/job-remark/remark", timings: [] };
  let remarkFetches = 0;
  await page.route("**/api/jobs/latest**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST" ? route.fulfill({ json: { id: base.id } }) : route.fallback(),
  );
  await page.route("**/api/jobs/job-remark/remark", (route) => {
    remarkFetches++;
    return route.fulfill({ body: "not audio", contentType: "audio/mpeg" });
  });
  await page.route("**/api/jobs/job-remark", (route) =>
    route.fulfill({
      json:
        state === "pending" ? { ...base, status: "pending" }
        : state === "claimed" ? { ...base, status: "claimed", remark }
        : { ...base, status: "done", found: true, replyText: "Your keys are on the desk, old chap." },
    }),
  );

  await page.goto("/");
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-live", "true");
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Where are my keys?");
  await page.getByRole("textbox").fill("Where are my keys?");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("remark")).toHaveCount(0); // no photo yet, no remark

  state = "claimed"; // the camera's photo is in
  await expect(page.getByTestId("remark")).toHaveText(remark.text);
  await expect.poll(() => remarkFetches).toBeGreaterThan(0);

  state = "done";
  await expect(page.getByTestId("answer")).toContainText("on the desk");
  await expect(page.getByTestId("remark")).toHaveCount(0);
  await expect(page.getByTestId("remark-audio")).toHaveCount(0); // its voice is gone with it
});

test("the prompt is a brass-framed walnut panel around parchment, with a brass send button", async ({ page }) => {
  await page.route("**/api/jobs/latest**", (route) => route.fulfill({ status: 204 }));
  await page.goto("/");
  const prompt = page.getByTestId("prompt");
  await expect(prompt).toHaveAttribute("data-live", "true");
  await expect(prompt.locator(".vn-panel")).toHaveCSS("border-top-color", "rgb(168, 119, 42)");
  await expect(prompt.locator(".vn-parchment")).toBeVisible();

  // The send button is a faint outline until there is something to send, then solid brass.
  const send = page.getByTestId("send");
  await expect(send).toBeDisabled();
  await expect(send).not.toHaveClass(/vn-button/);
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Where are my keys?");
  await page.getByRole("textbox").fill("Where is my pocket watch?");
  await expect(send).toBeEnabled();
  await expect(send).toHaveClass(/vn-button/);
});

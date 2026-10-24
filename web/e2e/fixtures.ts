import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "brass-test";
export const TEST_PI_TOKEN = "pi-test";

/** Builders for stubbed API responses. Shapes follow web/lib/data/types.ts. */

export const replies = JSON.parse(readFileSync(join(__dirname, "../lib/data/mock/replies.json"), "utf8")) as Record<string, { text: string; audio: string; timings: { word: string; start: number; end: number }[] }>;

export const sighting = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  seenAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  label: "keys",
  confidence: 0.88,
  box: { x: 0.1, y: 0.6, w: 0.08, h: 0.09 },
  zone: "side table",
  snapshot: { id: "snap-03", url: "/mock/snap-03.svg", width: 1280, height: 720 },
  ...over,
});

export const job = (over: Record<string, unknown> = {}) => ({
  id: "job-1",
  status: "pending",
  stale: false,
  createdAt: new Date().toISOString(),
  transcript: null,
  target: null,
  itemId: null,
  found: null,
  replyText: null,
  replyAudioUrl: null,
  replyTimings: null,
  match: null,
  lastSighting: null,
  error: null,
  ...over,
});

export const foundWallet = (over: Record<string, unknown> = {}) =>
  job({
    status: "done",
    transcript: "Where's my wallet?",
    target: "wallet",
    itemId: "item-wallet",
    found: true,
    replyText: replies["reply-wallet"].text,
    replyAudioUrl: replies["reply-wallet"].audio,
    replyTimings: replies["reply-wallet"].timings,
    match: sighting({
      id: "m1",
      label: "wallet",
      confidence: 0.91,
      zone: "desk",
      seenAt: new Date().toISOString(),
      box: { x: 0.5, y: 0.517, w: 0.102, h: 0.114 },
      snapshot: { id: "snap-01", url: "/mock/snap-01.svg", width: 1280, height: 720 },
    }),
    ...over,
  });

/** Every GET of a job answers with `body`; creating jobs still goes to the server. */
export async function stubJob(page: Page, body: unknown) {
  await page.route(/\/api\/jobs\/(?!next)[^/]+$/, (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: body }) : route.continue(),
  );
}

export async function stubStatus(page: Page, pi: boolean, desktop = true) {
  const at = (ok: boolean) => new Date(Date.now() - (ok ? 2_000 : 5 * 60_000)).toISOString();
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: [
        { device: "pi", lastSeenAt: at(pi), online: pi },
        { device: "desktop", lastSeenAt: at(desktop), online: desktop },
      ],
    }),
  );
}

/** Waits until the prompt is hydrated and the greeting has streamed in; parts of a page hydrate separately. */
export async function hydrated(page: Page) {
  await page.locator('[data-testid="prompt"][data-live]').waitFor();
  await page.getByText("was the last thing seen").waitFor();
}

/** Picks one of the three ways to ask from the prompt's menu. */
export async function chooseMode(page: Page, name: "Speak here" | "Type it" | "Camera button") {
  await hydrated(page);
  await page.getByRole("button", { name: /How to ask/ }).click();
  await page.getByRole("menuitem", { name: new RegExp(name) }).click();
  await expect(page.getByRole("button", { name: `How to ask: ${name}` })).toBeVisible();
}

/** Types a question into the prompt and sends it with Enter. */
export async function typeQuestion(page: Page, text: string) {
  await hydrated(page);
  await page.getByLabel("What are you looking for?").fill(text);
  await page.keyboard.press("Enter");
}

/** Press and hold the talk control with the mouse for `ms`. */
export async function hold(page: Page, ms: number) {
  await chooseMode(page, "Speak here");
  const talk = page.getByTestId("talk");
  const box = (await talk.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(talk, "the press reached the talk control").toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Replaces the media clock: play() succeeds at once and currentTime reads window.__t. */
export async function stubMediaClock(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __t?: number };
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get: () => w.__t ?? 0,
      set: (v: number) => {
        w.__t = v;
      },
    });
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
  });
}

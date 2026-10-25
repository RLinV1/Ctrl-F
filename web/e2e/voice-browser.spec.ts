import { test, expect, type Page } from "@playwright/test";
import type { JobView } from "../lib/data/types";

function answer(id = "pi-job", history: "available" | "never_seen" | "unavailable" = "available"): JobView {
  return { id, status: "done", stale: false, createdAt: new Date().toISOString(), transcript: "Where are my keys?",
    target: "keys", itemId: "keys", found: false, corrected: false,
    replyText: history === "available" ? "I cannot see your keys now. They were last seen on the desk beside the red mug." : "I cannot see your keys now.",
    replyAudioUrl: `/api/jobs/${id}/audio`, replyPending: false, replyTimings: [],
    photo: {id: "fresh", url: "/fresh.jpg", width: 1280, height: 720, seenAt: new Date().toISOString()}, match: null,
    lastSighting: history === "available" ? {id: "old", label: "keys", seenAt: "2026-10-24T14:35:00Z", confidence: null,
      box: {x:.2,y:.3,w:.1,h:.1}, zone: "desk", locationDescription: "On the desk beside the red mug",
      snapshot: {id: "old", url: "/old.jpg", width:1280,height:720}} : null,
    historyStatus: history, error: null };
}

async function mock(page: Page, job: JobView, device: boolean, blocked = true) {
  await page.addInitScript(({blocked}) => {
    (window as unknown as {playCalls: number}).playCalls = 0;
    HTMLMediaElement.prototype.play = function() {
      (window as unknown as {playCalls: number}).playCalls++;
      if (blocked) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
      this.dispatchEvent(new Event("play"));
      setTimeout(() => this.dispatchEvent(new Event("ended")), 100);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function() {};
  }, {blocked});
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/status") return route.fulfill({json: [
      {device:"pi",online:true,lastSeenAt:new Date().toISOString()}, {device:"desktop",online:true,lastSeenAt:new Date().toISOString()}]});
    if (url.pathname === "/api/items") return route.fulfill({json: []});
    if (url.pathname === "/api/jobs/latest") {
      if (!device || url.searchParams.get("afterId") === job.id) return route.fulfill({status:204});
      job.createdAt = new Date().toISOString();
      return route.fulfill({json:{id:job.id,createdAt:job.createdAt}});
    }
    if (url.pathname === "/api/jobs" && route.request().method() === "POST") return route.fulfill({status:201,json:{id:job.id}});
    if (url.pathname === `/api/jobs/${job.id}`) return route.fulfill({json:job});
    if (url.pathname.endsWith("/audio")) return route.fulfill({contentType:"audio/mpeg",body:Buffer.from([])});
    return route.fulfill({status:404});
  });
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1kAAAAASUVORK5CYII=", "base64");
  await page.route(/\/(old|fresh)\.jpg/, route => route.fulfill({contentType:"image/png",body:image}));
  await page.emulateMedia({reducedMotion:"reduce"});
}

test("Pi request arrives in typing mode and shows the marked historical image", async ({page}) => {
  await mock(page, answer(), true);
  await page.goto("/");
  await expect(page.getByRole("button", {name:"How to ask: Type it"})).toBeVisible();
  await expect(page.getByTestId("answer")).toContainText("Where are my keys?", {timeout:15_000});
  await expect(page.getByText("Press play to hear the answer.")).toBeVisible();
  await page.getByRole("button", {name:"Show the camera's photo"}).click();
  await expect(page.getByTestId("last-seen-caption")).toContainText("desk beside the red mug");
  await expect(page.getByAltText("Last photo with the keys")).toHaveAttribute("src", "/old.jpg");
  await expect(page.getByRole("img", {name:"keys marked"})).toBeVisible();
  await expect(page.getByTestId("last-seen-caption")).not.toContainText("0%");
  await expect(page.getByRole("link", {name:"View history"})).toHaveAttribute("href", "/items/keys");
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as unknown as {playCalls:number}).playCalls)).toBe(1);
});

for (const history of ["never_seen", "unavailable"] as const) {
  test(`typed request distinguishes ${history}`, async ({page}) => {
    await mock(page, answer("web-job", history), false);
    await page.goto("/");
    const enable = page.getByRole("button", {name:"Enable audio for camera replies"});
    await enable.click();
    await expect(enable).toHaveCount(0);
    await page.getByPlaceholder("Where are my keys?").fill("Where are my keys?");
    await page.getByRole("button", {name:"Send question"}).click();
    await expect(page.getByTestId("answer")).toContainText("Where are my keys?");
    await page.getByRole("button", {name:"Show the camera's photo"}).click();
    await expect(page.getByTestId("memory-status")).toContainText(history === "never_seen" ? "has not seen" : "cannot currently be checked");
    await expect(page.getByRole("img", {name:"keys marked"})).toHaveCount(0);
  });
}

test("blocked voice retains text and offers explicit replay", async ({page}) => {
  await mock(page, answer(), true);
  await page.goto("/");
  await page.getByRole("button", {name:"Enable audio for camera replies"}).click();
  await expect(page.getByTestId("answer")).toContainText("last seen on the desk");
  await page.getByRole("button", {name:"Play the reply"}).click();
  await expect(page.getByText("Press play to hear the answer.")).toBeVisible();
});


test("found photo uses its own normalized mark without fabricated confidence", async ({page}) => {
  const job = answer("found-job");
  job.found = true;
  job.match = {...job.lastSighting!, id:"current", seenAt:job.createdAt,
    snapshot:{id:"fresh",url:"/fresh.jpg",width:1280,height:720}};
  job.lastSighting = null;
  job.historyStatus = "not_needed";
  await mock(page, job, true);
  await page.goto("/");
  await expect(page.getByTestId("answer")).toContainText("Where are my keys?");
  await page.getByRole("button", {name:"Show the camera's photo"}).click();
  await expect(page.getByAltText("Camera photo with the keys circled")).toHaveAttribute("src", "/fresh.jpg");
  await expect(page.getByTestId("found-caption")).toContainText("desk beside the red mug");
  await expect(page.getByTestId("found-caption")).not.toContainText("0%");
});

test("a second Pi request waits until the active reply is dismissed", async ({page}) => {
  const job = answer();
  await mock(page, job, true);
  let discoveries = 0;
  page.on("request", r => { if (r.url().includes("/api/jobs/latest")) discoveries++; });
  await page.goto("/");
  await expect(page.getByTestId("answer")).toContainText("Where are my keys?");
  job.id = "second-pi-job";
  job.transcript = "Where is my wallet?";
  job.replyAudioUrl = `/api/jobs/${job.id}/audio`;
  const before = discoveries;
  await page.waitForTimeout(1700);
  expect(discoveries).toBe(before);
  await expect(page.getByTestId("answer")).not.toContainText("Where is my wallet?");
  await page.getByRole("button", {name:"Show the camera's photo"}).click();
  await expect(page.getByTestId("answer")).toContainText("Where is my wallet?");
});


test("a Pi result uploaded before web opened is still presented", async ({page}) => {
  const job = answer();
  const created = "2026-01-01T10:00:00Z";
  job.createdAt = created;
  await mock(page,job,true);
  await page.route("**/api/jobs/latest?**", route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("afterId") === job.id || Date.parse(url.searchParams.get("since")!) >= Date.parse(created)) return route.fulfill({status:204});
    return route.fulfill({json:{id:job.id,createdAt:created}});
  });
  await page.goto("/");
  await expect(page.getByTestId("answer")).toContainText("Where are my keys?");
  await expect(page.getByTestId("answer")).toContainText("last seen on the desk");
});


test("new bottle category displays current location and offers spoken reply", async ({page}) => {
  const job = answer("new-bottle-job");
  job.transcript = "Where is my bottle?";
  job.target = "bottle"; job.itemId = "bottle"; job.found = true;
  job.replyText = "Your bottle is on the desk beside the notebook.";
  job.match = {...job.lastSighting!,id:"bottle-sighting",label:"bottle",seenAt:job.createdAt,
    locationDescription:"On the desk beside the notebook",snapshot:{id:"fresh",url:"/fresh.jpg",width:1280,height:720}};
  job.lastSighting = null; job.historyStatus = "not_needed";
  await mock(page,job,false);
  await page.goto("/");
  await page.getByPlaceholder("Where are my keys?").fill(job.transcript);
  await page.getByRole("button",{name:"Send question"}).click();
  await expect(page.getByTestId("answer")).toContainText("Your bottle is on the desk");
  await expect(page.getByRole("button",{name:"Play the reply"})).toBeVisible();
  await page.getByRole("button",{name:"Play the reply"}).click();
  await expect(page.getByText("Press play to hear the answer.")).toBeVisible();
  await page.getByRole("button",{name:"Show the camera's photo"}).click();
  await expect(page.getByTestId("found-caption")).toContainText("beside the notebook");
  await expect(page.getByAltText("Camera photo with the bottle circled")).toHaveAttribute("src","/fresh.jpg");
});

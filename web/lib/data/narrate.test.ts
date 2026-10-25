import { describe, expect, it } from "vitest";
import { factsFor, findings, humanTime, namedItems, near, wordTimes, where, type Detection } from "./narrate";

const det = (name: string, box: [number, number, number, number], conf = 0.9): Detection => ({ name, conf, box });

describe("narration helpers", () => {
  it("words a box position", () => {
    expect(where([0.1, 0.1, 0.2, 0.2])).toBe("upper left");
    expect(where([0.4, 0.4, 0.6, 0.6])).toBe("center");
    expect(where([0.8, 0.7, 0.9, 0.9])).toBe("lower right");
  });

  it("finds the neighbour, skipping boxes that contain the item", () => {
    const keys = det("keys", [0.4, 0.4, 0.5, 0.5]);
    const wallet = det("wallet", [0.7, 0.4, 0.8, 0.5]);
    const table = det("table", [0, 0, 1, 1]);
    expect(near(keys, [keys, wallet, table])).toBe("left of the wallet");
    expect(near(keys, [keys, table])).toBeNull();
  });

  it("gives Gemini only facts from the result", () => {
    const keys = det("keys", [0.1, 0.1, 0.2, 0.2]);
    const facts = factsFor({ status: "found", target: "keys", matches: [keys], detections: [keys] });
    expect(facts).toMatchObject({ status: "found", item: "keys", where: "upper left", confidence_percent: 90 });
    expect(factsFor({ status: "not_visible", target: "keys", matches: [], detections: [] }, "3 h ago")).toMatchObject({
      status: "not_visible",
      last_seen_ago: "3 h ago",
    });
  });

  it("does not claim never seen without a successful lookup", () => {
    expect(factsFor({ status: "not_visible", target: "keys", matches: [], detections: [] })).toMatchObject({ history_status: "unavailable" });
  });

  it("finds items named in a sentence without Gemini", () => {
    const known = ["phone", "cell phone", "keys", "airpods case", "airpods"];
    expect(namedItems("Where are my keys?", known)).toEqual(["keys"]);
    expect(namedItems("find my cell phone", known)).toEqual(["cell phone"]);
    expect(namedItems("where is my airpods case", known)).toEqual(["airpods case"]);
    expect(namedItems("hello there", known)).toEqual([]);
  });

  it("works out found and not visible from detections alone", () => {
    const base = { status: "no_target" as const, target: null, matches: [], detections: [det("person", [0.1, 0.1, 0.5, 0.9], 0.7), det("person", [0.6, 0.1, 0.9, 0.9], 0.8)] };
    expect(findings(["person"], base)).toMatchObject({ status: "found", target: "person" });
    expect(findings(["person"], base).matches[0].conf).toBe(0.8); // best match first
    expect(findings(["keys", "person"], base)).toMatchObject({ status: "found", target: "person" });
    expect(findings(["keys"], base)).toMatchObject({ status: "not_visible", target: "keys", matches: [] });
  });

  it("turns character times into word times", () => {
    const chars = [..."hi yo"];
    const starts = chars.map((_, i) => i / 10);
    const ends = chars.map((_, i) => (i + 1) / 10);
    expect(wordTimes({ characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends })).toEqual([
      { word: "hi", start: 0, end: 0.2 },
      { word: "yo", start: 0.3, end: 0.5 },
    ]);
  });
});

describe("humanTime", () => {
  it("formats in Eastern time with the zone that applies on that date", () => {
    expect(humanTime("2026-10-25T06:39:34.678899+00:00")).toBe("October 25, 2026 at 2:39 AM EDT");
    expect(humanTime("2026-12-25T17:00:00Z")).toBe("December 25, 2026 at 12:00 PM EST");
  });
  it("leaves an unparseable value as is", () => {
    expect(humanTime("not a date")).toBe("not a date");
  });
});

import { describe, expect, it } from "vitest";
import { factsFor, near, wordTimes, where, type Detection } from "./narrate";

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

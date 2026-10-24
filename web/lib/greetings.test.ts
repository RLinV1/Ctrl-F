import { describe, expect, it } from "vitest";
import { GREETINGS, nextGreetingIndex } from "./greetings";

describe("greeting rotation", () => {
  it("starts at the first line and cycles through all three", () => {
    expect(GREETINGS).toHaveLength(3);
    expect(nextGreetingIndex(null)).toBe(0);
    expect(nextGreetingIndex("0")).toBe(1);
    expect(nextGreetingIndex("1")).toBe(2);
    expect(nextGreetingIndex("2")).toBe(0);
  });

  it("starts over when the stored value is not a valid index", () => {
    expect(nextGreetingIndex("banana")).toBe(0);
    expect(nextGreetingIndex("-3")).toBe(0);
  });
});

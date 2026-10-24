import { describe, expect, it } from "vitest";
import { passwordMatches, safeNext, signSession, verifySession } from "./session";

describe("sessions", () => {
  it("accepts its own cookie until it expires", () => {
    const cookie = signSession("brass", 0);
    expect(verifySession(cookie, "brass", 1000)).toBe(true);
    expect(verifySession(cookie, "brass", 31 * 24 * 60 * 60_000)).toBe(false);
  });

  it("rejects a cookie after the password changes, and tampered cookies", () => {
    const cookie = signSession("brass", 0);
    expect(verifySession(cookie, "copper", 1000)).toBe(false);
    expect(verifySession(`9${cookie}`, "brass", 1000)).toBe(false);
    expect(verifySession("nonsense", "brass", 0)).toBe(false);
    expect(verifySession(undefined, "brass", 0)).toBe(false);
  });

  it("compares passwords exactly", () => {
    expect(passwordMatches("brass", "brass")).toBe(true);
    expect(passwordMatches("bras", "brass")).toBe(false);
  });

  it("only returns to same-site paths", () => {
    expect(safeNext("/items")).toBe("/items");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

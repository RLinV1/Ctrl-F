import { describe, expect, it } from "vitest";
import { audioExtension } from "./rules";

describe("audioExtension", () => {
  it("maps recorder types to file extensions", () => {
    expect(audioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtension("audio/mp4")).toBe("m4a");
    expect(audioExtension("AUDIO/OGG")).toBe("ogg");
  });

  it("rejects anything else", () => {
    expect(() => audioExtension("video/mp4")).toThrow(/unsupported/);
  });
});

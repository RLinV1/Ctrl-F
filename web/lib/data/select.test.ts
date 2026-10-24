import { describe, expect, it } from "vitest";
import { dataSource } from "./select";

describe("dataSource", () => {
  it("runs the mock only when DATA_SOURCE is mock", () => {
    expect(dataSource({ DATA_SOURCE: "mock" })).toBe("mock");
    expect(dataSource({ DATA_SOURCE: " Mock " })).toBe("mock");
  });

  it("runs the S3 store otherwise", () => {
    expect(dataSource({})).toBe("s3");
    expect(dataSource({ DATA_SOURCE: "s3" })).toBe("s3");
  });
});

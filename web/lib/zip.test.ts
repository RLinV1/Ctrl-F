import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zip } from "./zip";

describe("zip", () => {
  it("writes an archive that a standard unzip can read back", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const a = new Uint8Array([1, 2, 3, 250, 0, 7]);
    const b = new TextEncoder().encode("second file");
    writeFileSync(join(dir, "a.zip"), zip([{ name: "a.jpg", data: a }, { name: "b.txt", data: b }]));
    const script = "import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(z.namelist(), z.read('a.jpg').hex(), z.read('b.txt').decode())\n";
    writeFileSync(join(dir, "check.py"), script);
    const out = execFileSync("python", [join(dir, "check.py"), join(dir, "a.zip")]).toString();
    expect(out).toContain("['a.jpg', 'b.txt']");
    expect(out).toContain(Buffer.from(a).toString("hex"));
    expect(out).toContain("second file");
  });
});

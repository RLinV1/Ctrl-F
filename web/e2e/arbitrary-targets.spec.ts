import {test, expect} from "@playwright/test";
import cases from "../../desktop/tests/fixtures/target-phrases.json";
import {pickTargets} from "../lib/data/narrate";
const known = ["keys", "keyring", "phone", "headphones", "airpods case"];
for (const fixture of cases) {
  test(`open target phrase: ${fixture.text}`, async () => {
    const result = await pickTargets(fixture.text, known);
    // Web passes alias phrases to desktop, which resolves database aliases.
    const expected = fixture.targets.map((target) => target === "keys" && fixture.text.includes("keyring") ? "keyring" : target);
    expect(result).toEqual({targets:expected,unsupported:null});
  });
}

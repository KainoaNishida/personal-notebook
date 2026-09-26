import { describe, it, expect } from "vitest";
import { bodyWords, addedWords, normalizeLabel } from "../src/progress";
import { minimalChange } from "../src/components/Editor";
import { themeTokens, darkBackgrounds } from "../src/theme";

describe("saved body-word comparison", () => {
  it("ignores formatting, word order, image filenames and link destinations", () => {
    const baseline = bodyWords("One two three four");
    expect(
      addedWords(
        baseline,
        "**four** _three_ two [One](https://example.org/five-six)\n![photo words.png](asset:123)",
      ),
    ).toBe(0);
    expect(addedWords(baseline, "One two three four five")).toBe(1);
  });
  it("counts pasted and generated prose and repeated new words", () => {
    expect(
      addedWords(
        bodyWords("existing text"),
        "existing text alpha alpha beta gamma delta",
      ),
    ).toBe(5);
    expect(addedWords(bodyWords("existing text"), "existing text")).toBe(0);
    expect(addedWords(bodyWords("existing text"), "")).toBe(0);
  });
  it("normalizes Unicode, case, and whitespace", () => {
    expect(bodyWords("CAFÉ ２０２６")).toEqual(["café", "2026"]);
    expect(normalizeLabel("  Graph   THEORY ")).toBe("graph theory");
  });
  it("does not count Markdown reference definitions or code-fence languages", () => {
    expect(
      bodyWords("```python\nalpha beta\n```\n[ref]: https://host/file-name"),
    ).toEqual(["alpha", "beta"]);
  });
});
describe("remote editor updates", () => {
  it("preserves the unchanged prefix and suffix", () => {
    expect(minimalChange("first\nold\nlast", "first\nnew text\nlast")).toEqual({
      from: 6,
      to: 9,
      insert: "new text",
    });
    expect(minimalChange("hello", "hello!")).toEqual({
      from: 5,
      to: 5,
      insert: "!",
    });
  });
});
it("normalizes legacy light appearances while retaining accent customization", () => {
  const result = themeTokens({
    timezone: "UTC",
    theme: "light",
    mainColor: "#ffffff",
    accentColor: "#00ff00",
  });
  expect(result["--bg"]).toBe(darkBackgrounds[0]);
  expect(result["--accent"]).toBe("#00ff00");
  expect(result["--text"]).toBe("#fafafa");
});

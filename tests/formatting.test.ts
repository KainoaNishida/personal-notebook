import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { formatTransaction, type Format } from "../src/components/formatting";
import {
  themeTokens,
  darkBackgrounds,
  luminance,
  readableAccent,
} from "../src/theme";
import { bodyWords } from "../src/progress";
function format(doc: string, kind: Format, from = 0, to = doc.length) {
  const state = EditorState.create({
    doc,
    selection: { anchor: from, head: to },
  });
  return state.update(formatTransaction(state, kind)).state;
}
describe("formatting commands", () => {
  it.each([
    ["bold", "**hello**"],
    ["italic", "*hello*"],
    ["inlineCode", "`hello`"],
    ["inlineMath", "$hello$"],
    ["math", "$$\nhello\n$$"],
    ["link", "[hello](https://example.com)"],
  ] as [Format, string][])("formats selected text: %s", (kind, expected) => {
    const state = format("hello", kind);
    expect(state.doc.toString()).toBe(expected);
    expect(
      state.sliceDoc(state.selection.main.from, state.selection.main.to),
    ).toBe("hello");
  });
  it("selects an editable placeholder", () => {
    const state = format("", "bold");
    expect(state.doc.toString()).toBe("**text**");
    expect(state.selection.main.from).toBe(2);
    expect(state.selection.main.to).toBe(6);
  });
  it("uses fences longer than embedded backticks", () => {
    expect(format("```js\nx\n```", "code").doc.toString()).toBe(
      "````\n```js\nx\n```\n````",
    );
    expect(format("`x`", "inlineCode").doc.toString()).toBe("`` `x` ``");
  });
  it("formats entire selected lines without including the following line", () => {
    expect(format("first\nsecond\nthird", "number", 2, 13).doc.toString()).toBe(
      "1. first\n2. second\nthird",
    );
    expect(format("## first", "h1", 4, 7).doc.toString()).toBe("# first");
  });
  it("formats the full selected line for a code block", () => {
    expect(format("before middle after", "code", 7, 13).doc.toString()).toBe(
      "```\nbefore middle after\n```",
    );
  });
  it("does not add body words when formatting existing words", () => {
    for (const kind of [
      "bold",
      "italic",
      "h2",
      "code",
      "link",
      "bullet",
      "number",
      "task",
      "quote",
    ] as Format[]) {
      expect(
        bodyWords(format("existing words here", kind).doc.toString()),
      ).toEqual(bodyWords("existing words here"));
    }
  });
});
it("uses the Calm desk palette without replacing saved custom backgrounds", () => {
  expect(darkBackgrounds).toContain("#18181b");
  expect(themeTokens({ theme: "dark", timezone: "UTC" })["--bg"]).toBe(
    "#1c1d20",
  );
  expect(
    themeTokens({
      theme: "dark",
      timezone: "UTC",
      mainColor: "#111827",
      accentColor: "#ffffff",
    })["--bg"],
  ).toBe("#111827");
});

it("keeps default and normalized custom accents readable on raised surfaces", () => {
  for (const ink of [
    "#eeeae4",
    "#b1aea8",
    "#e8b68a",
    readableAccent("#101010"),
  ]) {
    expect(
      (luminance(ink) + 0.05) / (luminance("#2e3035") + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

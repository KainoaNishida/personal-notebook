import { EditorSelection, type EditorState } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

export type Format =
  | "bold"
  | "italic"
  | "h1"
  | "h2"
  | "h3"
  | "inlineCode"
  | "code"
  | "inlineMath"
  | "math"
  | "link"
  | "bullet"
  | "number"
  | "task"
  | "quote";

export function formatTransaction(state: EditorState, kind: Format) {
  let { from, to } = state.selection.main;
  let text = state.sliceDoc(from, to);
  let before = "",
    after = "",
    placeholder = "text";
  const lines = /^(h[123]|bullet|number|task|quote)$/.test(kind);
  if (lines) {
    const first = state.doc.lineAt(from);
    const last = state.doc.lineAt(
      to > from && state.doc.lineAt(to).from === to ? to - 1 : to,
    );
    from = first.from;
    to = last.to;
    text = state.sliceDoc(from, to) || "text";
    text = text
      .split("\n")
      .map((line, i) => {
        const prefix = kind.startsWith("h")
          ? "#".repeat(Number(kind[1])) + " "
          : kind === "number"
            ? `${i + 1}. `
            : kind === "task"
              ? "- [ ] "
              : kind === "quote"
                ? "> "
                : "- ";
        return (
          prefix + (kind.startsWith("h") ? line.replace(/^#{1,6} /, "") : line)
        );
      })
      .join("\n");
  } else {
    if (kind === "code" || kind === "math") {
      const first = state.doc.lineAt(from);
      const last = state.doc.lineAt(
        to > from && state.doc.lineAt(to).from === to ? to - 1 : to,
      );
      from = first.from;
      to = last.to;
      text = state.sliceDoc(from, to);
    }
    if (kind === "bold") before = after = "**";
    if (kind === "italic") before = after = "*";
    if (kind === "inlineCode" || kind === "code") {
      const fence = "`".repeat(
        Math.max(
          kind === "code" ? 3 : 1,
          ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1),
        ),
      );
      before = after = fence;
      placeholder = "code";
      if (kind === "code") {
        before += "\n";
        after = "\n" + after;
      } else if (/^`|`$|^ .* $/.test(text)) {
        before += " ";
        after = " " + after;
      }
    }
    if (kind === "inlineMath") {
      before = after = "$";
      placeholder = "x^2";
    }
    if (kind === "math") {
      before = "$$\n";
      after = "\n$$";
      placeholder = "x^2";
    }
    if (kind === "link") {
      before = "[";
      after = "](https://example.com)";
      placeholder = "link text";
    }
    text ||= placeholder;
    if (kind === "code" || kind === "math") {
      if (from && state.sliceDoc(from - 1, from) !== "\n")
        before = "\n" + before;
      if (to < state.doc.length && state.sliceDoc(to, to + 1) !== "\n")
        after += "\n";
    }
  }
  return {
    changes: { from, to, insert: before + text + after },
    selection: EditorSelection.single(
      from + before.length,
      from + before.length + text.length,
    ),
    annotations: isolateHistory.of("full"),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}
export function applyFormat(view: EditorView, kind: Format) {
  view.dispatch(formatTransaction(view.state, kind));
  view.focus();
  return true;
}

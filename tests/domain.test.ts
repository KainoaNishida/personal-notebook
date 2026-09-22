import { describe, it, expect } from "vitest";
import {
  today,
  shiftDate,
  normalizeRect,
  validateUpload,
  responseSchema,
  aiMarkdown,
} from "../src/domain";
import { EditorState } from "@codemirror/state";
import { previewRanges } from "../src/components/Editor";
describe("journal dates", () => {
  it("uses the selected timezone across midnight", () => {
    expect(today("America/Los_Angeles", new Date("2026-09-23T03:00:00Z"))).toBe(
      "2026-09-22",
    );
    expect(today("UTC", new Date("2026-09-23T03:00:00Z"))).toBe("2026-09-23");
  });
  it("handles leap days without DST drift", () => {
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
  });
});
describe("PDF reference geometry", () => {
  it("keeps normalized coordinates independent of zoom", () => {
    expect(
      normalizeRect({ x: 100, y: 200, width: 50, height: 20 }, 500, 1000),
    ).toEqual(
      normalizeRect({ x: 200, y: 400, width: 100, height: 40 }, 1000, 2000),
    );
  });
  it("clips regions at page boundaries", () => {
    expect(
      normalizeRect({ x: 90, y: 95, width: 40, height: 20 }, 100, 100),
    ).toEqual({ x: 0.9, y: 0.95, width: 1 - 0.9, height: 1 - 0.95 });
  });
});
describe("uploads and structured output", () => {
  it("rejects executable formats and oversized images", () => {
    expect(() =>
      validateUpload({ type: "image/svg+xml", size: 20 }, false),
    ).toThrow();
    expect(() =>
      validateUpload({ type: "image/png", size: 11 * 1024 * 1024 }, false),
    ).toThrow();
    expect(() =>
      validateUpload({ type: "application/pdf", size: 24 * 1024 * 1024 }, true),
    ).not.toThrow();
  });
  it("rejects unbounded/invalid plot specs", () => {
    expect(
      responseSchema.safeParse({
        markdown: "Explanation",
        assumptions: [],
        visuals: [
          {
            type: "plot",
            title: "x",
            source: '{"type":"line","points":[]}',
            explanation: "",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("attaches the verified source and distinguishes AI content", () => {
    const result = aiMarkdown(
      {
        markdown: "Consider the dimensions.",
        assumptions: ["Illustrative example"],
        visuals: [],
      },
      "verified",
    );
    expect(result).toContain("annotation:verified");
    expect(result).toContain("AI-assisted");
    expect(result).toContain("Illustrative example");
  });
});
describe("live Markdown editing", () => {
  it("does not replace the active line", () => {
    const s = EditorState.create({
      doc: "# Title\n\nWriting **bold**",
      selection: { anchor: 12 },
    });
    expect(previewRanges(s)).toEqual([{ from: 0, to: 7 }]);
  });
  it("keeps the entire active fenced block editable", () => {
    const s = EditorState.create({
      doc: "Intro\n```mermaid\nflowchart LR\nA-->B\n```\n\nEnd",
      selection: { anchor: 22 },
    });
    const ranges = previewRanges(s);
    expect(ranges.some((r) => r.from === 6)).toBe(false);
    expect(ranges[0]).toEqual({ from: 0, to: 5 });
  });
});

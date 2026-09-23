import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Markdown,
  safeUrl,
  Plot,
  isPlainDiagram,
} from "../src/components/Markdown";
describe("safe visual rendering", () => {
  it("allows scientific arrows in quoted labels while rejecting interactive or HTML diagrams", () => {
    expect(
      isPlainDiagram(
        'flowchart TD\nA["Divide by sqrt(d_k) -> (n_q x n_k)"] --> B["Weights"]',
      ),
    ).toBe(true);
    for (const source of [
      'flowchart TD\nA["<img src=x>"]',
      'flowchart TD\nclick A "https://example.com"',
      '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD',
      'flowchart TD\nA["javascript:alert(1)"]',
    ])
      expect(isPlainDiagram(source)).toBe(false);
  });
  it("changes image layout through metadata without migrating Markdown prose", () => {
    const NativeURL = URL;
    vi.stubGlobal(
      "URL",
      class extends NativeURL {
        static createObjectURL() {
          return "blob:proof";
        }
        static revokeObjectURL() {}
      },
    );
    const client = new QueryClient();
    client.setQueryData(["asset", "proof"], new Blob(["image"]));
    const text =
      "![Portrait study](asset:proof)\n\nLight falls across the cheek.";
    const { container, rerender } = render(
      <QueryClientProvider client={client}>
        <Markdown text={text} />
      </QueryClientProvider>,
    );
    expect(container.querySelector(".asset-image")).not.toHaveStyle({
      float: "left",
    });
    rerender(
      <QueryClientProvider client={client}>
        <Markdown
          text={text}
          imagePresentation={{ proof: { alignment: "left", width: 40 } }}
        />
      </QueryClientProvider>,
    );
    expect(container.querySelector(".asset-image")).toHaveStyle({
      float: "left",
      width: "40%",
    });
    expect(
      screen.getByRole("img", { name: "Portrait study" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Light falls across the cheek."),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  it("rejects script, data, and arbitrary embedded protocols", () => {
    for (const u of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///secrets",
    ])
      expect(safeUrl(u)).toBe("");
    expect(safeUrl("annotation:abc")).toBe("annotation:abc");
  });
  it("does not render raw HTML", () => {
    const { container } = render(
      <Markdown text={"<script>alert(1)</script>\n\n# A real heading"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "A real heading" }),
    ).toBeInTheDocument();
  });
  it("renders a useful text alternative and a data table for plots", () => {
    render(
      <Plot
        source={JSON.stringify({
          title: "An example",
          xLabel: "Time",
          yLabel: "Value",
          type: "line",
          points: [
            { x: 0, y: 1 },
            { x: 1, y: 2 },
          ],
        })}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "An example. Time versus Value",
    );
    expect(screen.getByText("View data")).toBeInTheDocument();
  });
});

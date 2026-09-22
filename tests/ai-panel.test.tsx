import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AIPanel } from "../src/components/AIPanel";
import type { RecordItem } from "../src/domain";
import * as api from "../src/service";
vi.mock("../src/service", () => ({
  explain: vi.fn(),
  generationHistory: vi.fn(async () => []),
  usage: vi.fn(async () => ({
    spent: 0,
    reserved: 0,
    limit: 20000000,
    month: "2026-09",
  })),
  save: vi.fn(async (kind, id, data) => ({ kind, id, data, revision: 1 })),
}));
const annotation: RecordItem<"annotation"> = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "annotation",
  revision: 1,
  updated_at: "",
  deleted_at: null,
  data: {
    paperId: "00000000-0000-4000-8000-000000000002",
    page: 3,
    text: "Q K transpose divided by sqrt(d_k)",
    rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.1 }],
    kind: "text",
  },
};
function setup() {
  const insert = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AIPanel
        annotation={annotation}
        context="Nearby paragraph"
        records={[]}
        onClose={() => {}}
        onInsert={insert}
      />
    </QueryClientProvider>,
  );
  return insert;
}
beforeEach(() => vi.clearAllMocks());
it("sends only approved context on explicit request, supports follow-up and source-linked insertion", async () => {
  vi.mocked(api.explain).mockResolvedValue({
    markdown: "The scale controls logit variance.",
    assumptions: ["Illustrative explanation"],
    visuals: [],
  });
  const insert = setup();
  expect(api.explain).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Explain selection" }));
  await screen.findByRole("button", { name: "Insert into note" });
  expect(vi.mocked(api.explain).mock.calls[0][0]).toMatchObject({
    context: "",
    annotationId: annotation.id,
    turns: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Insert into note" }));
  expect(insert.mock.calls[0][0]).toContain(`annotation:${annotation.id}`);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include nearby context" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Ask a follow-up" }), {
    target: { value: "Why divide by the square root?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask follow-up" }));
  await waitFor(() => expect(api.explain).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.explain).mock.calls[1][0]).toMatchObject({
    context: "Nearby paragraph",
    turns: [{ question: expect.any(String), response: expect.any(Object) }],
  });
});
it("does not retry malformed or failed generation and does not insert it", async () => {
  vi.mocked(api.explain).mockRejectedValue(
    new Error("The generated explanation was malformed."),
  );
  const insert = setup();
  fireEvent.click(screen.getByRole("button", { name: "Explain selection" }));
  await screen.findByText("The generated explanation was malformed.");
  expect(api.explain).toHaveBeenCalledTimes(1);
  expect(insert).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Insert into note" })).toBeNull();
});

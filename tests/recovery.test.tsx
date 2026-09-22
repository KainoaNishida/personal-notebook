import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDraft } from "../src/hooks";
import * as api from "../src/service";
import type { RecordItem } from "../src/domain";
vi.mock("../src/service", () => ({
  recoveryPrefix: "recovery-test:",
  save: vi.fn(),
  ConflictError: class extends Error {
    remote: unknown;
    constructor(remote: unknown) {
      super("Conflict");
      this.remote = remote;
    }
  },
}));
const record: RecordItem<"entry"> = {
  id: "note",
  kind: "entry",
  revision: 1,
  updated_at: "",
  deleted_at: null,
  data: {
    title: "Original",
    markdown: "",
    date: "2026-09-22",
    notebookId: "book",
  },
};
function setup() {
  const client = new QueryClient();
  return renderHook(() => useDraft(record), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
it("drains edits made during an in-flight save before navigation completes", async () => {
  let resolveFirst!: (value: RecordItem<"entry">) => void;
  vi.mocked(api.save).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
  );
  vi.mocked(api.save).mockImplementationOnce(
    async (_kind, _id, data) => ({ ...record, data, revision: 3 }) as never,
  );
  const { result, unmount } = setup();
  act(() => result.current.change({ ...record.data, title: "First" }));
  let flushed!: Promise<void>;
  act(() => {
    flushed = result.current.flush();
  });
  act(() => result.current.change({ ...record.data, title: "Latest" }));
  unmount();
  await act(async () => {
    resolveFirst({
      ...record,
      data: { ...record.data, title: "First" },
      revision: 2,
    });
    await flushed;
  });
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.save).mock.calls[1][2]).toMatchObject({
    title: "Latest",
  });
  expect(vi.mocked(api.save).mock.calls[1][3]).toBe(2);
  expect(localStorage.getItem("recovery-test:note")).toBeNull();
});
it("retains recovery text after a failed server save", async () => {
  vi.mocked(api.save).mockRejectedValue(new Error("Connection interrupted"));
  const { result } = setup();
  act(() =>
    result.current.change({ ...record.data, markdown: "Do not lose this" }),
  );
  await act(() => result.current.flush());
  expect(result.current.status).toBe("Not saved");
  expect(localStorage.getItem("recovery-test:note")).toContain(
    "Do not lose this",
  );
});
it("requires conflict resolution when a recovered revision is stale", () => {
  localStorage.setItem(
    "recovery-test:note",
    JSON.stringify({
      revision: 0,
      data: { ...record.data, title: "Recovered" },
    }),
  );
  const { result } = setup();
  expect(result.current.value.title).toBe("Recovered");
  expect(result.current.conflict).toEqual(record);
  expect(result.current.error).toContain("Review both");
  expect(api.save).not.toHaveBeenCalled();
});

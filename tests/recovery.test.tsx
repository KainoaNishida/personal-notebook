import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDraft, sameData } from "../src/hooks";
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
  sessionStorage.clear();
  vi.clearAllMocks();
});
it("ignores JSONB key ordering when checking recovery drafts", () => {
  const reordered = Object.fromEntries(Object.entries(record.data).reverse());
  expect(sameData(record.data, reordered)).toBe(true);
  localStorage.setItem(
    "recovery-test:note",
    JSON.stringify({ revision: 1, data: reordered }),
  );
  const { result } = setup();
  expect(result.current.conflict).toBeNull();
  expect(drafts()).toHaveLength(0);
});
it("resumes autosaving after explicitly keeping a conflicting draft", async () => {
  const remote = {
    ...record,
    revision: 2,
    data: { ...record.data, markdown: "Other window" },
  };
  vi.mocked(api.save).mockRejectedValueOnce(new api.ConflictError(remote));
  vi.mocked(api.save).mockImplementationOnce(
    async (_kind, _id, data) => ({ ...record, data, revision: 3 }) as never,
  );
  const { result } = setup();
  act(() => result.current.change({ ...record.data, markdown: "My text" }));
  await act(() => result.current.flush());
  expect(result.current.conflict).toEqual(remote);
  await act(() => result.current.keepMine());
  expect(result.current.conflict).toBeNull();
  expect(result.current.error).toBe("");
  expect(result.current.status).toBe("Saved");
  expect(vi.mocked(api.save).mock.calls[1][3]).toBe(2);
});
function drafts() {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith("recovery-test:note"))
    .map((key) => JSON.parse(localStorage.getItem(key)!));
}
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
  expect(drafts()).toEqual([]);
});
it("retains recovery text after a failed server save", async () => {
  vi.mocked(api.save).mockRejectedValue(new Error("Connection interrupted"));
  const { result } = setup();
  act(() =>
    result.current.change({ ...record.data, markdown: "Do not lose this" }),
  );
  await act(() => result.current.flush());
  expect(result.current.status).toBe("Not saved");
  expect(drafts()[0].data.markdown).toBe("Do not lose this");
});
it("does not erase another window's newer recovery draft when a save completes", async () => {
  let finish!: (value: RecordItem<"entry">) => void;
  vi.mocked(api.save).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve as typeof finish;
      }),
  );
  const { result } = setup();
  const mine = { ...record.data, title: "Saved window" };
  act(() => result.current.change(mine));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.flush();
  });
  const other = {
    revision: 1,
    data: { ...record.data, title: "Other window unsaved" },
  };
  localStorage.setItem("recovery-test:note", JSON.stringify(other));
  await act(async () => {
    finish({ ...record, data: mine, revision: 2 });
    await pending;
  });
  expect(result.current.status).toBe("Saved");
  expect(JSON.parse(localStorage.getItem("recovery-test:note")!)).toEqual(
    other,
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
it("recreates the losing draft if recovery storage was cleared during a save", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(api.save).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const { result } = setup();
  act(() => result.current.change({ ...record.data, title: "Losing draft" }));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.flush();
  });
  localStorage.clear();
  const remote = {
    ...record,
    revision: 2,
    data: { ...record.data, title: "Winning server version" },
  };
  await act(async () => {
    fail(new api.ConflictError(remote));
    await pending;
  });
  expect(result.current.conflict).toEqual(remote);
  expect(drafts()[0].data.title).toBe("Losing draft");
});
it("preserves each losing window through overlapping saves and recovery review", async () => {
  const first = setup(),
    second = setup(),
    winner = setup();
  const remote = {
    ...record,
    revision: 2,
    data: { ...record.data, title: "Winner" },
  };
  vi.mocked(api.save).mockImplementation(async (_kind, _id, data) => {
    if ((data as typeof record.data).title === "Winner") return remote as never;
    throw new api.ConflictError(remote);
  });
  act(() => {
    first.result.current.change({
      ...record.data,
      title: "First losing version",
    });
    second.result.current.change({
      ...record.data,
      title: "Second losing version",
    });
    winner.result.current.change(remote.data);
  });
  expect(drafts()).toHaveLength(3);
  await act(async () => {
    await winner.result.current.flush();
    await Promise.all([
      first.result.current.flush(),
      second.result.current.flush(),
    ]);
  });
  expect(
    drafts()
      .map((d) => d.data.title)
      .sort(),
  ).toEqual(["First losing version", "Second losing version"]);
  first.unmount();
  second.unmount();
  winner.unmount();
  const recovered = setup();
  expect(recovered.result.current.status).toBe("Review recovered draft");
  const chosen = recovered.result.current.value.title;
  act(() => recovered.result.current.acceptRemote());
  expect(drafts()).toHaveLength(1);
  expect(drafts()[0].data.title).not.toBe(chosen);
  expect(recovered.result.current.recoveryNotice).toContain(
    "Other unsaved versions",
  );
  recovered.unmount();
  const remaining = setup();
  expect(remaining.result.current.status).toBe("Review recovered draft");
  expect(remaining.result.current.value.title).not.toBe(chosen);
});

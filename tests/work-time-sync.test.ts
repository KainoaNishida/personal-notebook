import { expect, it, vi } from "vitest";
import { WorkTimeSync, hasUnsyncedWorkTime } from "../src/workTimeSync";
import type { WorkTransport } from "../src/workTimeSync";
import type { RecordItem } from "../src/domain";
import { formatDuration } from "../src/timeCalculator";

import { memoryStorage, account } from "./work-time-helpers";
const day = "2026-10-02";
const legacyKey = "kais-notebook:work-time:owner";
const legacy = (storage: Storage, seconds: number) =>
  storage.setItem(
    legacyKey,
    JSON.stringify({ version: 1, days: { [day]: seconds } }),
  );

it("imports 21:25:30 from one device and loads exactly that total on another, without duplication", async () => {
  const server = account(),
    a = memoryStorage(),
    b = memoryStorage();
  legacy(a, 11229);
  a.setItem(
    "kais-notebook:time-calculator:owner",
    JSON.stringify({ date: day, input: "10:00, 10:00" }),
  );
  const original = a.getItem(legacyKey);
  const first = new WorkTimeSync(a, server, "owner");
  await first.refresh();
  expect(formatDuration(first.total()!)).toBe("21:25:30");
  expect(a.getItem(legacyKey)).toBe(original);
  const other = new WorkTimeSync(b, server, "owner");
  await other.refresh();
  expect(formatDuration(other.total()!)).toBe("21:25:30");
  expect(other.value(day, "taskInput")).toBe("10:00, 10:00");
  await new WorkTimeSync(a, server, "owner").refresh();
  legacy(b, 11229);
  await new WorkTimeSync(b, server, "owner").refresh();
  expect(await server.list()).toHaveLength(1);
  expect((await server.list())[0].revision).toBe(2);
});

it("merges different fields/days but requires review for simultaneous daily-total edits", async () => {
  const server = account();
  const a = new WorkTimeSync(memoryStorage(), server, "owner"),
    b = new WorkTimeSync(memoryStorage(), server, "owner");
  await Promise.all([a.refresh(), b.refresh()]);
  a.change(day, "actualSeconds", 3600);
  b.change(day, "taskInput", "10:00");
  await Promise.all([a.flush(), b.flush()]);
  await b.refresh();
  expect(b.value(day, "actualSeconds")).toBe(3600);
  a.change(day, "actualSeconds", 7200);
  b.change(day, "actualSeconds", 5400);
  await a.flush();
  await b.flush();
  const pending = b.getSnapshot().pending[0];
  expect(b.getSnapshot().conflicts[pending.id]).toBe(7200);
  expect((await server.list())[0].data.actualSeconds).toBe(7200);
  b.resolve(pending.id, true);
  await b.flush();
  await a.refresh();
  expect(a.value(day, "actualSeconds")).toBe(5400);
  b.change("2026-10-03", "actualSeconds", 1800);
  await b.flush();
  expect(b.value("2026-10-04", "actualSeconds")).toBeNull();
  expect(formatDuration(b.total()!)).toBe("20:18:21");
});

it("does not re-import an old browser value over later account edits, including deliberate zero", async () => {
  const server = account(),
    storage = memoryStorage();
  legacy(storage, 3600);
  await new WorkTimeSync(storage, server, "owner").refresh();
  await server.save(day, "actualSeconds", 0, 3600);
  const reload = new WorkTimeSync(storage, server, "owner");
  await reload.refresh();
  expect(reload.value(day, "actualSeconds")).toBe(0);
  const oldDevice = memoryStorage();
  legacy(oldDevice, 7200);
  const conflict = new WorkTimeSync(oldDevice, server, "owner");
  await conflict.refresh();
  expect(Object.values(conflict.getSnapshot().conflicts)).toEqual([0]);
  conflict.resolve(conflict.getSnapshot().pending[0].id, false);
  await new WorkTimeSync(oldDevice, server, "owner").refresh();
  expect((await server.list())[0].data.actualSeconds).toBe(0);
});

it("recovers an offline edit on its original day after reload and deduplicates a lost response", async () => {
  const storage = memoryStorage(),
    server = account();
  const flaky: WorkTransport = {
    ...server,
    save: vi.fn(async (...args: Parameters<WorkTransport["save"]>) => {
      await server.save(...args);
      throw new Error("lost response");
    }),
  };
  const first = new WorkTimeSync(storage, flaky, "owner");
  await first.refresh();
  first.change(day, "actualSeconds", 11229);
  await first.flush();
  expect(first.getSnapshot().error).toMatch(/not synced/);
  expect(first.getSnapshot().pending).toHaveLength(1);
  const reopened = new WorkTimeSync(storage, server, "owner");
  await reopened.refresh();
  expect(reopened.getSnapshot().pending).toHaveLength(0);
  expect(formatDuration(reopened.total()!)).toBe("21:25:30");
  expect((await server.list())[0].revision).toBe(1);
});

it("drains edits made during an in-flight save without reverting to the earlier response", async () => {
  const server = account();
  let release!: () => void;
  const delayed: WorkTransport = {
    ...server,
    save: async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return server.save(...args);
    },
  };
  const sync = new WorkTimeSync(memoryStorage(), delayed, "owner");
  await sync.refresh();
  sync.change(day, "actualSeconds", 100);
  const saving = sync.flush();
  sync.change(day, "actualSeconds", 200);
  release();
  await vi.waitFor(() =>
    expect(sync.getSnapshot().records[0]?.data.actualSeconds).toBe(100),
  );
  release();
  await saving;
  expect(sync.value(day, "actualSeconds")).toBe(200);
  expect(sync.getSnapshot().pending).toHaveLength(0);
});

it("preserves damaged legacy data and never reports a fabricated opening-balance total", async () => {
  const storage = memoryStorage();
  storage.setItem(legacyKey, "damaged");
  const sync = new WorkTimeSync(storage, account(), "owner");
  await sync.refresh();
  expect(sync.total()).toBeNull();
  expect(sync.getSnapshot().recoveryError).toMatch(/not been changed/);
  expect(storage.getItem(legacyKey)).toBe("damaged");
});

it("blocks incomplete exports before migration and while a daily edit is pending", async () => {
  const storage = memoryStorage();
  expect(hasUnsyncedWorkTime(storage, "owner")).toBe(false);
  legacy(storage, 11229);
  expect(hasUnsyncedWorkTime(storage, "owner")).toBe(true);
  const sync = new WorkTimeSync(storage, account(), "owner");
  await sync.refresh();
  expect(hasUnsyncedWorkTime(storage, "owner")).toBe(false);
  sync.change(day, "actualSeconds", 12000);
  expect(hasUnsyncedWorkTime(storage, "owner")).toBe(true);
  await sync.flush();
  expect(hasUnsyncedWorkTime(storage, "owner")).toBe(false);
});

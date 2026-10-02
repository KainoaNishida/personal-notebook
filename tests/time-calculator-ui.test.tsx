import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimeCalculator } from "../src/components/TimeCalculator";

vi.mock("../src/service", () => ({ demo: false }));
const workKey = "kais-notebook:work-time:owner";
const actual = () =>
  screen.getByRole("textbox", { name: "Actual time worked (HH:MM:SS)" });
const tasks = () =>
  screen.getByRole("textbox", { name: "Times (MM:SS, separated by commas)" });
const enter = (value: string) =>
  fireEvent.change(actual(), { target: { value } });
const earnings = (today: string, allTime: string) => {
  expect(screen.getByLabelText("Today's earnings")).toHaveTextContent(today);
  expect(screen.getByLabelText("All-time earnings")).toHaveTextContent(allTime);
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("keeps the maximum separate from actual time and restores both after reload", () => {
  const view = render(<TimeCalculator date="2026-10-02" />);
  earnings("$0.00", "$1,464.47");
  fireEvent.change(tasks(), { target: { value: "10:00, 10:00" } });
  expect(
    screen.getByLabelText("Time total multiplied by seven"),
  ).toHaveTextContent("02:20:00");
  earnings("$0.00", "$1,464.47");
  enter("01:30:00");
  earnings("$120.00", "$1,584.47");
  expect(screen.getByLabelText("All-time hours")).toHaveTextContent("19:48:21");
  view.unmount();
  render(<TimeCalculator date="2026-10-02" />);
  expect(actual()).toHaveValue("01:30:00");
  expect(tasks()).toHaveValue("10:00, 10:00");
  earnings("$120.00", "$1,584.47");
});

it("replaces daily amounts and retains earlier days across midnight and skipped days", () => {
  const view = render(<TimeCalculator key="2026-10-02" date="2026-10-02" />);
  enter("01:30:00");
  enter("02:00:00");
  earnings("$160.00", "$1,624.47");
  view.rerender(<TimeCalculator key="2026-10-03" date="2026-10-03" />);
  expect(actual()).toHaveValue("");
  earnings("$0.00", "$1,624.47");
  enter("00:30:00");
  earnings("$40.00", "$1,664.47");
  enter("");
  earnings("$0.00", "$1,624.47");
  enter("00:30:00");
  view.rerender(<TimeCalculator key="2026-10-06" date="2026-10-06" />);
  earnings("$0.00", "$1,664.47");
  expect(screen.getByLabelText("All-time hours")).toHaveTextContent("20:48:21");
});

it("keeps the last valid actual time when an incomplete edit is reloaded", () => {
  const view = render(<TimeCalculator date="2026-10-02" />);
  enter("01:00:00");
  const saved = localStorage.getItem(workKey);
  enter("01:00:99");
  expect(actual()).toHaveAttribute("aria-invalid", "true");
  earnings("—", "—");
  expect(localStorage.getItem(workKey)).toBe(saved);
  view.unmount();
  render(<TimeCalculator date="2026-10-02" />);
  expect(actual()).toHaveValue("01:00:00");
  earnings("$80.00", "$1,544.47");
  fireEvent.change(tasks(), { target: { value: "bad task input" } });
  earnings("$80.00", "$1,544.47");
});

it("merges saved days from another tab before writing and refreshes other-tab changes", () => {
  render(<TimeCalculator date="2026-10-03" />);
  localStorage.setItem(
    workKey,
    JSON.stringify({ version: 1, days: { "2026-10-02": 3600 } }),
  );
  enter("00:30:00");
  earnings("$40.00", "$1,584.47");
  localStorage.setItem(
    workKey,
    JSON.stringify({
      version: 1,
      days: { "2026-10-02": 3600, "2026-10-03": 7200 },
    }),
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: workKey, storageArea: localStorage }),
    ),
  );
  expect(actual()).toHaveValue("02:00:00");
  earnings("$160.00", "$1,704.47");
});

it("does not claim an unsaved entry is included in the running total", () => {
  render(<TimeCalculator date="2026-10-02" />);
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage full");
    });
  enter("01:00:00");
  expect(screen.getByText(/Actual time could not be saved/)).toBeVisible();
  earnings("$80.00", "—");
  write.mockRestore();
  enter("02:00:00");
  earnings("$160.00", "$1,624.47");
  expect(
    screen.queryByText(/Actual time could not be saved/),
  ).not.toBeInTheDocument();
});

it("does not overwrite an unreadable work log or pretend the opening balance is the total", () => {
  localStorage.setItem(workKey, "damaged log");
  render(<TimeCalculator date="2026-10-02" />);
  expect(screen.getByText(/saved work log could not be read/)).toBeVisible();
  earnings("$0.00", "—");
  enter("01:00:00");
  expect(localStorage.getItem(workKey)).toBe("damaged log");
  earnings("$80.00", "—");
});

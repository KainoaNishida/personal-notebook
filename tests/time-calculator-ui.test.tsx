import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimeCalculator } from "../src/components/TimeCalculator";
import { account } from "./work-time-helpers";
import type { WorkTransport } from "../src/workTimeSync";
let server: WorkTransport;
vi.mock("../src/service", () => ({
  demo: false,
  listWorkTime: () => server.list(),
  saveWorkTime: (...args: Parameters<WorkTransport["save"]>) =>
    server.save(...args),
}));
const actual = () =>
  screen.getByRole("textbox", { name: "Actual time worked (HH:MM:SS)" });
const tasks = () =>
  screen.getByRole("textbox", { name: "Times (MM:SS, separated by commas)" });
const enter = (value: string) => {
  fireEvent.change(actual(), { target: { value } });
  fireEvent.blur(actual());
};
const synced = () =>
  waitFor(() =>
    expect(screen.getByLabelText("Hours sync status")).toHaveTextContent(
      "Hours synced",
    ),
  );
beforeEach(() => {
  localStorage.clear();
  server = account();
});
afterEach(() => vi.restoreAllMocks());

it("syncs both inputs and retains earnings across reload and midnight", async () => {
  const view = render(<TimeCalculator key="2026-10-02" date="2026-10-02" />);
  await synced();
  fireEvent.change(tasks(), { target: { value: "10:00, 10:00" } });
  expect(
    screen.getByLabelText("Time total multiplied by seven"),
  ).toHaveTextContent("02:20:00");
  enter("01:30:00");
  await synced();
  expect(screen.getByLabelText("Today's earnings")).toHaveTextContent(
    "$120.00",
  );
  view.unmount();
  const reload = render(<TimeCalculator key="2026-10-02" date="2026-10-02" />);
  await synced();
  expect(actual()).toHaveValue("01:30:00");
  expect(tasks()).toHaveValue("10:00, 10:00");
  enter("02:00:00");
  await synced();
  reload.rerender(<TimeCalculator key="2026-10-03" date="2026-10-03" />);
  await synced();
  expect(actual()).toHaveValue("");
  expect(tasks()).toHaveValue("");
  enter("00:30:00");
  await synced();
  expect(screen.getByLabelText("All-time hours")).toHaveTextContent("20:48:21");
  enter("");
  await synced();
  expect(screen.getByLabelText("All-time hours")).toHaveTextContent("20:18:21");
});

it("preserves the last valid saved time through invalid edits and receives another device's changes on focus", async () => {
  const view = render(<TimeCalculator date="2026-10-02" />);
  await synced();
  enter("01:00:00");
  await synced();
  enter("01:00:99");
  expect(actual()).toHaveAttribute("aria-invalid", "true");
  view.unmount();
  render(<TimeCalculator date="2026-10-02" />);
  await synced();
  expect(actual()).toHaveValue("01:00:00");
  await server.save("2026-10-02", "actualSeconds", 7200, 3600);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(actual()).toHaveValue("02:00:00"));
});

it("shows and resolves a legacy/account conflict without silently overwriting hours", async () => {
  await server.save("2026-10-02", "actualSeconds", 3600, null);
  localStorage.setItem(
    "kais-notebook:work-time:owner",
    JSON.stringify({ version: 1, days: { "2026-10-02": 11229 } }),
  );
  render(<TimeCalculator date="2026-10-03" />);
  expect(
    await screen.findByRole("button", { name: "Keep account value" }),
  ).toBeVisible();
  expect(screen.getByText("03:07:09")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Use this device’s value" }),
  );
  await synced();
  expect(screen.getByLabelText("All-time hours")).toHaveTextContent("21:25:30");
});

it("keeps offline edits recoverable and shows a retry action", async () => {
  render(<TimeCalculator date="2026-10-02" />);
  await synced();
  const save = vi.spyOn(server, "save").mockRejectedValue(new Error("Offline"));
  enter("01:00:00");
  expect(
    await screen.findByRole("button", { name: "Retry hours sync" }),
  ).toBeVisible();
  save.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Retry hours sync" }));
  await synced();
  expect((await server.list())[0].data.actualSeconds).toBe(3600);
});

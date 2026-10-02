import { expect, it } from "vitest";
import { formatDuration } from "../src/timeCalculator";
import {
  formatEarnings,
  parseActualTime,
  readWorkLog,
  totalWorkedSeconds,
} from "../src/workTime";

it("starts with the exact opening balance and only adds October 2 onward", () => {
  expect(formatDuration(totalWorkedSeconds({}))).toBe("18:18:21");
  expect(formatEarnings(totalWorkedSeconds({}))).toBe("$1,464.47");
  const total = totalWorkedSeconds({
    "2026-10-01": 3600,
    "2026-10-02": 5400,
    "2026-10-03": 3723,
  });
  expect(formatDuration(total)).toBe("20:50:24");
  expect(formatEarnings(total)).toBe("$1,667.20");
});

it("pays actual seconds at $80/hour and rounds only the final total", () => {
  expect(parseActualTime(" 01:30:45 ")).toEqual({ valid: true, seconds: 5445 });
  expect(formatEarnings(5445)).toBe("$121.00");
  expect(formatEarnings(3600)).toBe("$80.00");
  expect(formatEarnings(1)).toBe("$0.02");
  expect(formatEarnings(3)).toBe("$0.07");
  expect(parseActualTime("")).toEqual({ valid: true, seconds: 0 });
});

it.each([
  "1:30",
  "01:60:00",
  "01:00:60",
  "-1:00:00",
  "1.5:00:00",
  "abc",
  "99999999999999:00:00",
])("rejects invalid actual time %s", (input) => {
  expect(parseActualTime(input).valid).toBe(false);
});

it("restores the daily log and rejects damaged records instead of resetting earnings", () => {
  expect(readWorkLog(null)).toEqual({});
  expect(readWorkLog('{"version":1,"days":{"2026-10-02":3600}}')).toEqual({
    "2026-10-02": 3600,
  });
  for (const value of [
    "broken",
    "null",
    "{}",
    '{"version":1,"days":[]}',
    '{"version":1,"days":{"2026-10-02":-1}}',
    '{"version":1,"days":{"2026-10-02":"3600"}}',
  ])
    expect(() => readWorkLog(value)).toThrow();
});

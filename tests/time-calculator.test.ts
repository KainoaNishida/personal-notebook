import { expect, it } from "vitest";
import { calculateTimes } from "../src/timeCalculator";
it.each([
  ["", "00:00:00"],
  ["10:00", "01:10:00"],
  ["10:00, 10:00", "02:20:00"],
  [" 00:30, 1:05 ", "00:11:05"],
  ["60:00", "07:00:00"],
  ["1000:00", "116:40:00"],
])("totals %s as %s", (input, total) =>
  expect(calculateTimes(input)).toMatchObject({ valid: true, total }),
);
it.each([
  "10:60",
  "10:1",
  "-1:00",
  "1.5:00",
  "1:00:00",
  "abc",
  "10:00,",
  ",10:00",
  "10:00,,20:00",
  "9999999999999999999:00",
])("rejects %s without showing a partial total", (input) =>
  expect(calculateTimes(input).valid).toBe(false),
);

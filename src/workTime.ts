export const WORK_LOG_START_DATE = "2026-10-02";
export const STARTING_WORK_SECONDS = 18 * 3600 + 18 * 60 + 21;
const HOURLY_RATE = 80;
export type WorkLog = Record<string, number>;

export function validSeconds(seconds: unknown): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isSafeInteger(seconds) &&
    seconds >= 0 &&
    Number.isSafeInteger(seconds * HOURLY_RATE)
  );
}

export function parseActualTime(
  input: string,
): { valid: true; seconds: number } | { valid: false; error: string } {
  if (!input.trim()) return { valid: true, seconds: 0 };
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(input.trim());
  if (!match)
    return {
      valid: false,
      error: "Use HH:MM:SS, with minutes and seconds from 00 to 59.",
    };
  const seconds =
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!validSeconds(seconds))
    return {
      valid: false,
      error: "This time is too large. Use a shorter duration.",
    };
  return { valid: true, seconds };
}

export function totalWorkedSeconds(log: WorkLog): number {
  // The opening balance already includes every day before October 2, 2026.
  const total = Object.entries(log).reduce(
    (sum, [date, seconds]) => sum + (date >= WORK_LOG_START_DATE ? seconds : 0),
    STARTING_WORK_SECONDS,
  );
  if (!validSeconds(total))
    throw new Error("The work time total is too large.");
  return total;
}

export function readWorkLog(serialized: string | null): WorkLog {
  if (serialized === null) return {};
  const saved = JSON.parse(serialized);
  if (
    saved?.version !== 1 ||
    !saved.days ||
    typeof saved.days !== "object" ||
    Array.isArray(saved.days) ||
    !Object.entries(saved.days).every(
      ([date, seconds]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && validSeconds(seconds),
    )
  )
    throw new Error("The saved work log could not be read.");
  totalWorkedSeconds(saved.days);
  return saved.days;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatEarnings(seconds: number): string {
  // Keep whole seconds in the log; round money only when displaying it.
  return currency.format((seconds * HOURLY_RATE) / 3600);
}

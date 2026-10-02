/** Durations, not clock times: minutes may exceed 59. */
export function calculateTimes(
  input: string,
):
  | { valid: true; total: string; count: number }
  | { valid: false; error: string } {
  if (!input.trim()) return { valid: true, total: "00:00:00", count: 0 };
  const items = input.split(",");
  let seconds = 0;
  for (let i = 0; i < items.length; i++) {
    const match = /^(\d+):([0-5]\d)$/.exec(items[i].trim());
    if (!match)
      return {
        valid: false,
        error: `Time ${i + 1} must use MM:SS, with seconds from 00 to 59.`,
      };
    seconds += Number(match[1]) * 60 + Number(match[2]);
    if (!Number.isSafeInteger(seconds * 7))
      return {
        valid: false,
        error: "The total is too large. Use shorter durations.",
      };
  }
  const multiplied = seconds * 7;
  return {
    valid: true,
    total: formatDuration(multiplied),
    count: items.length,
  };
}

export function formatDuration(seconds: number): string {
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

import { it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useJournalDate } from "../src/hooks";
it("advances Today at timezone midnight and on return from sleep", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T06:59:59Z"));
  const { result, unmount } = renderHook(() =>
    useJournalDate("America/Los_Angeles"),
  );
  expect(result.current).toBe("2026-09-26");
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current).toBe("2026-09-27");
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  act(() => window.dispatchEvent(new Event("focus")));
  expect(result.current).toBe("2026-09-29");
  unmount();
  vi.useRealTimers();
});

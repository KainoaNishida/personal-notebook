import { useEffect, useId, useState } from "react";
import { calculateTimes, formatDuration } from "../timeCalculator";
import {
  formatEarnings,
  parseActualTime,
  readWorkLog,
  totalWorkedSeconds,
} from "../workTime";
import type { WorkLog } from "../workTime";
import { demo } from "../service";

export function TimeCalculator({ date }: { date: string }) {
  const id = useId();
  const storageKey = `kais-notebook:time-calculator:${demo ? "preview" : "owner"}`;
  const workStorageKey = `kais-notebook:work-time:${demo ? "preview" : "owner"}`;
  const [work, setWork] = useState<{ log: WorkLog; error: boolean }>(() => {
    try {
      return {
        log: readWorkLog(localStorage.getItem(workStorageKey)),
        error: false,
      };
    } catch {
      return { log: {}, error: true };
    }
  });
  const [actualInput, setActualInput] = useState(() =>
    work.log[date] === undefined ? "" : formatDuration(work.log[date]),
  );
  const [workSaveError, setWorkSaveError] = useState(false);
  const [input, setInput] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return saved?.date === date && typeof saved.input === "string"
        ? saved.input
        : "";
    } catch {
      return "";
    }
  });
  const [saveError, setSaveError] = useState(false);
  const result = calculateTimes(input);
  const actual = parseActualTime(actualInput);
  const allTimeSeconds = work.error ? null : totalWorkedSeconds(work.log);

  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (
        event.storageArea !== localStorage ||
        (event.key !== null && event.key !== workStorageKey)
      )
        return;
      try {
        const log = readWorkLog(localStorage.getItem(workStorageKey));
        setWork({ log, error: false });
        if (!workSaveError)
          setActualInput((previous) =>
            parseActualTime(previous).valid
              ? log[date] === undefined
                ? ""
                : formatDuration(log[date])
              : previous,
          );
      } catch {
        setWork((old) => ({ ...old, error: true }));
      }
    }
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [workStorageKey, date, workSaveError]);

  function changeActual(value: string) {
    setActualInput(value);
    const parsed = parseActualTime(value);
    if (!parsed.valid) return;
    try {
      // Merge with the latest saved days so another tab cannot erase earlier work.
      const log = readWorkLog(localStorage.getItem(workStorageKey));
      if (value.trim()) log[date] = parsed.seconds;
      else delete log[date];
      totalWorkedSeconds(log);
      localStorage.setItem(
        workStorageKey,
        JSON.stringify({ version: 1, days: log }),
      );
      setWork({ log, error: false });
      setWorkSaveError(false);
    } catch {
      setWorkSaveError(true);
    }
  }
  function change(value: string) {
    setInput(value);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ date, input: value }));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }
  return (
    <section className="time-calculator" aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <h2 id={`${id}-title`}>Time calculator × 7</h2>
      </div>
      <div className="time-calculator-card">
        <div className="time-calculator-input">
          <label htmlFor={id}>Times (MM:SS, separated by commas)</label>
          <input
            id={id}
            type="text"
            value={input}
            onChange={(e) => change(e.target.value)}
            placeholder="10:00, 10:00"
            spellCheck={false}
            maxLength={10000}
            aria-invalid={!result.valid}
            aria-describedby={`${id}-help${result.valid ? "" : ` ${id}-error`}`}
          />
          <p id={`${id}-help`} className="small muted">
            Task times × 7 gives today’s maximum allowed time. This list starts
            fresh each day.
          </p>
          {!result.valid && (
            <p id={`${id}-error`} className="inline-error" role="status">
              {result.error}
            </p>
          )}
          {saveError && (
            <p role="status" className="inline-error">
              Browser storage is unavailable. This list will not survive a
              reload.
            </p>
          )}
          <div className="time-calculator-actual">
            <label htmlFor={`${id}-actual`}>
              Actual time worked (HH:MM:SS)
            </label>
            <input
              id={`${id}-actual`}
              type="text"
              value={actualInput}
              onChange={(e) => changeActual(e.target.value)}
              placeholder="00:00:00"
              spellCheck={false}
              maxLength={20}
              aria-invalid={!actual.valid}
              aria-describedby={`${id}-actual-help${actual.valid ? "" : ` ${id}-actual-error`}`}
            />
            <p id={`${id}-actual-help`} className="small muted">
              Saved by day in this browser. Earnings use actual time at
              $80/hour.
            </p>
            {!actual.valid && (
              <p
                id={`${id}-actual-error`}
                className="inline-error"
                role="status"
              >
                {actual.error} Your last valid time stays saved.
              </p>
            )}
            {(work.error || workSaveError) && (
              <p role="status" className="inline-error">
                {workSaveError
                  ? "Actual time could not be saved. Keep this tab open and copy your time before reloading."
                  : "The saved work log could not be read. Your saved data has not been changed."}
              </p>
            )}
          </div>
        </div>
        <div className="time-calculator-total">
          <span className="small muted">Maximum time today · HH:MM:SS</span>
          <output
            htmlFor={id}
            aria-label="Time total multiplied by seven"
            aria-live="polite"
          >
            {result.valid ? result.total : "—"}
          </output>
          <dl className="time-calculator-earnings small">
            <div>
              <dt>Today’s earnings</dt>
              <dd>
                <output
                  htmlFor={`${id}-actual`}
                  aria-label="Today's earnings"
                  aria-live="polite"
                >
                  {actual.valid ? formatEarnings(actual.seconds) : "—"}
                </output>
              </dd>
            </div>
            <div>
              <dt>All-time earnings</dt>
              <dd>
                <output aria-label="All-time earnings" aria-live="polite">
                  {actual.valid && allTimeSeconds !== null && !workSaveError
                    ? formatEarnings(allTimeSeconds)
                    : "—"}
                </output>
              </dd>
            </div>
          </dl>
          <p className="small muted time-calculator-hours">
            All-time hours:{" "}
            <span aria-label="All-time hours">
              {actual.valid && allTimeSeconds !== null && !workSaveError
                ? formatDuration(allTimeSeconds)
                : "—"}
            </span>
          </p>
          <p className="small muted time-calculator-baseline">
            Includes 18:18:21 worked before Oct 2, 2026.
          </p>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { calculateTimes, formatDuration } from "../timeCalculator";
import { formatEarnings, parseActualTime } from "../workTime";
import { WorkTimeSync } from "../workTimeSync";
import { demo, listWorkTime, saveWorkTime } from "../service";

const displayValue = (value: string | number | null) =>
  typeof value === "number"
    ? formatDuration(value)
    : value === null
      ? "Not recorded"
      : value || "Empty list";

export function TimeCalculator({ date }: { date: string }) {
  const id = useId();
  const [sync] = useState(
    () =>
      new WorkTimeSync(
        localStorage,
        { list: listWorkTime, save: saveWorkTime },
        demo ? "preview" : "owner",
      ),
  );
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const [actualDraft, setActualDraft] = useState<string | null>(null);
  const storedActual = sync.value(date, "actualSeconds");
  const actualInput =
    actualDraft ??
    (typeof storedActual === "number" ? formatDuration(storedActual) : "");
  const input = String(sync.value(date, "taskInput") ?? "");
  const result = calculateTimes(input);
  const actual = parseActualTime(actualInput);
  const allTimeSeconds = sync.total();
  const blocked =
    !state.ready ||
    !!state.recoveryError ||
    state.pending.some((p) => p.legacy || p.id in state.conflicts);
  useEffect(() => {
    const refresh = () => {
      void sync.refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
      else void sync.flush();
    };
    refresh();
    const interval = setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", visible);
      void sync.flush();
    };
  }, [sync]);
  function changeActual(value: string) {
    setActualDraft(value);
    const parsed = parseActualTime(value);
    if (parsed.valid) sync.change(date, "actualSeconds", parsed.seconds);
  }
  return (
    <section className="time-calculator" aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <h2 id={`${id}-title`}>Time calculator × 7</h2>
      </div>
      <p className="small muted" role="status" aria-label="Hours sync status">
        {state.recoveryError ||
          state.error ||
          (Object.keys(state.conflicts).length
            ? "Different values need review. Both versions are preserved."
            : !state.ready
              ? "Loading account hours…"
              : state.pending.length
                ? "Syncing hours… Totals include changes on this device."
                : demo
                  ? "Saved in preview"
                  : "Hours synced")}
      </p>
      {state.error && (
        <button onClick={() => void sync.refresh()}>Retry hours sync</button>
      )}
      {state.pending
        .filter((edit) => edit.id in state.conflicts)
        .map((edit) => (
          <div
            className="time-sync-conflict"
            key={edit.id}
            role="group"
            aria-label={`Review time for ${edit.date}`}
          >
            <p>
              {edit.date} ·{" "}
              {edit.field === "actualSeconds" ? "Actual time" : "Task times"}
            </p>
            <p className="small">
              This device: <strong>{displayValue(edit.value)}</strong>
              <br />
              Account: <strong>{displayValue(state.conflicts[edit.id])}</strong>
            </p>
            <button
              onClick={() => {
                setActualDraft(null);
                sync.resolve(edit.id, false);
              }}
            >
              Keep account value
            </button>{" "}
            <button
              onClick={() => {
                setActualDraft(null);
                sync.resolve(edit.id, true);
              }}
            >
              Use this device’s value
            </button>
          </div>
        ))}
      <div className="time-calculator-card">
        <div className="time-calculator-input">
          <label htmlFor={id}>Times (MM:SS, separated by commas)</label>
          <input
            id={id}
            type="text"
            value={input}
            onChange={(e) => sync.change(date, "taskInput", e.target.value)}
            disabled={blocked}
            onBlur={() => void sync.flush()}
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
          <div className="time-calculator-total">
            <span className="small muted">Maximum time today · HH:MM:SS</span>
            <output
              htmlFor={id}
              aria-label="Time total multiplied by seven"
              aria-live="polite"
            >
              {result.valid ? result.total : "—"}
            </output>
          </div>
        </div>
        <div className="time-calculator-actual">
          <label htmlFor={`${id}-actual`}>Actual time worked (HH:MM:SS)</label>
          <input
            id={`${id}-actual`}
            type="text"
            value={actualInput}
            onChange={(e) => changeActual(e.target.value)}
            disabled={blocked}
            onBlur={() => {
              if (actual.valid) setActualDraft(null);
              void sync.flush();
            }}
            placeholder="00:00:00"
            spellCheck={false}
            maxLength={20}
            aria-invalid={!actual.valid}
            aria-describedby={`${id}-actual-help${actual.valid ? "" : ` ${id}-actual-error`}`}
          />
          <p id={`${id}-actual-help`} className="small muted">
            Synced to your account by day. Earnings use actual time at $80/hour.
          </p>
          {!actual.valid && (
            <p id={`${id}-actual-error`} className="inline-error" role="status">
              {actual.error} Your last valid time stays saved.
            </p>
          )}
          <dl className="time-calculator-earnings">
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
          </dl>
        </div>
        <div className="time-calculator-footer">
          <p className="small muted time-calculator-hours">
            All-time hours:{" "}
            <span aria-label="All-time hours">
              {actual.valid && allTimeSeconds !== null
                ? formatDuration(allTimeSeconds)
                : "—"}
            </span>
          </p>
          <p className="small muted time-calculator-baseline">
            Includes 18:18:21 worked before Oct 2, 2026.
          </p>
          <dl className="time-calculator-earnings">
            <div>
              <dt>All-time earnings</dt>
              <dd>
                <output aria-label="All-time earnings" aria-live="polite">
                  {actual.valid && allTimeSeconds !== null
                    ? formatEarnings(allTimeSeconds)
                    : "—"}
                </output>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

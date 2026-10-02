import { useId, useState } from "react";
import { calculateTimes } from "../timeCalculator";
import { demo } from "../service";

export function TimeCalculator({ date }: { date: string }) {
  const id = useId();
  const storageKey = `kais-notebook:time-calculator:${demo ? "preview" : "owner"}`;
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
            Saved in this browser. Starts fresh each day.
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
        </div>
        <div className="time-calculator-total">
          <span className="small muted">Total × 7 · HH:MM:SS</span>
          <output
            htmlFor={id}
            aria-label="Time total multiplied by seven"
            aria-live="polite"
          >
            {result.valid ? result.total : "—"}
          </output>
        </div>
      </div>
    </section>
  );
}

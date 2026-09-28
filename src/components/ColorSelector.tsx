import { Check } from "lucide-react";
import { darkBackgrounds, readableAccent } from "../theme";

export const validColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const presets = [
  "#f59a56",
  "#f87171",
  "#facc15",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#94a3b8",
];
const backgroundNames = ["Charcoal", "Midnight", "Forest", "Plum", "Cocoa"];

export function ColorSelector({
  label,
  value,
  onChange,
  background = false,
  accent = false,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  background?: boolean;
  accent?: boolean;
}) {
  const valid = validColor(value);
  const effective = valid
    ? accent
      ? readableAccent(value)
      : value
    : "transparent";
  return (
    <fieldset className="color-selector">
      <legend>{label}</legend>
      <div className="color-swatches">
        {(background ? darkBackgrounds : presets).map((color, index) => (
          <button
            type="button"
            key={color}
            aria-label={`${label}: ${background ? backgroundNames[index] : color}`}
            aria-pressed={value.toLowerCase() === color}
            title={background ? backgroundNames[index] : color}
            onClick={() => onChange(color)}
          >
            <span className="color-swatch" style={{ background: color }} />
            {background && <span>{backgroundNames[index]}</span>}
            {value.toLowerCase() === color && (
              <Check size={14} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {!background && (
        <div className="color-custom">
          <label>
            {label} hex
            <input
              aria-label={`${label} hex`}
              value={value}
              maxLength={7}
              aria-invalid={!valid}
              spellCheck={false}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
          <span
            className="color-preview"
            style={{ background: effective }}
            aria-label={`${label} preview${valid ? ` ${effective}` : " unavailable"}`}
          />
          {!valid && (
            <span role="alert" className="color-error">
              Enter a six-digit hex color, such as #f59a56.
            </span>
          )}
          {accent &&
            valid &&
            effective.toLowerCase() !== value.toLowerCase() && (
              <small className="muted">
                Shown as {effective} for readable contrast.
              </small>
            )}
        </div>
      )}
    </fieldset>
  );
}

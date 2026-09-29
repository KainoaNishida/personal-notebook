import type { Settings } from "./domain";
export const darkBackgrounds = [
  "#1c1d20",
  "#18181b",
  "#111827",
  "#17201c",
  "#211b27",
  "#241c18",
];
export function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function lightColor(hex: string) {
  return luminance(hex) > 0.179;
}
export function readableAccent(hex: string) {
  // Accent text also appears on raised dark surfaces, so use the lightest one.
  const floor = luminance("#454047");
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let step = 0; step <= 100; step++) {
    const candidate =
      "#" +
      rgb
        .map((v) =>
          Math.round(v + ((255 - v) * step) / 100)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if ((luminance(candidate) + 0.05) / (floor + 0.05) >= 4.5) return candidate;
  }
  return "#ffffff";
}
export function themeTokens(settings: Settings): Record<string, string> {
  const tokens: Record<string, string> = {};
  const main = darkBackgrounds.includes(settings.mainColor || "")
      ? settings.mainColor
      : darkBackgrounds[0],
    accent =
      settings.accentColor && /^#[0-9a-f]{6}$/i.test(settings.accentColor)
        ? readableAccent(settings.accentColor)
        : undefined;
  if (main && /^#[0-9a-f]{6}$/i.test(main)) {
    const light = lightColor(main),
      ink = light ? "#18181b" : "#fafafa";
    Object.assign(tokens, {
      "--bg": main,
      "--text": ink,
      "--muted": light ? "#303036" : "#dedee3",
      "--sidebar": `color-mix(in srgb, ${main} 95%, ${ink})`,
      "--surface": `color-mix(in srgb, ${main} 94%, ${ink})`,
      "--surface2": `color-mix(in srgb, ${main} 88%, ${ink})`,
      "--border": `color-mix(in srgb, ${main} 70%, ${ink})`,
      "--rhythm-empty": `color-mix(in srgb, ${main} 80%, ${ink})`,
    });
  }
  if (accent && /^#[0-9a-f]{6}$/i.test(accent))
    Object.assign(tokens, {
      "--accent": accent,
      "--accent-text": lightColor(accent) ? "#18181b" : "#fafafa",
    });
  if (main === "#1c1d20")
    Object.assign(tokens, {
      "--bg": "#1c1d20",
      "--sidebar": "#242529",
      "--surface": "#242529",
      "--surface2": "#2e3035",
      "--border": "#3b3d42",
      "--text": "#eeeae4",
      "--muted": "#b1aea8",
      "--rhythm-empty": "#3b3d42",
    });
  return tokens;
}

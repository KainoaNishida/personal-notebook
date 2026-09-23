import type { Settings } from "./domain";
export function lightColor(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 0.179;
}
export function themeTokens(settings: Settings): Record<string, string> {
  const tokens: Record<string, string> = {};
  const main = settings.mainColor,
    accent = settings.accentColor;
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
  return tokens;
}

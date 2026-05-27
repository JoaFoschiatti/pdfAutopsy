import type { HighlightColor } from "./types";

export const DEFAULT_COLORS: HighlightColor[] = ["yellow", "mint", "blue", "rose"];

export const COLOR_VALUES: Record<string, string> = {
  yellow: "#ffd451",
  mint: "#8ddcc8",
  blue: "#83afff",
  rose: "#ff7f95",
};

export function colorToCss(color: HighlightColor) {
  return COLOR_VALUES[color] ?? color;
}

export function colorToRgba(color: HighlightColor, alpha: number) {
  const cssColor = colorToCss(color);
  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(cssColor);
  if (!hexMatch) return cssColor;

  const value = hexMatch[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function isValidHexColor(value: string) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!isValidHexColor(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

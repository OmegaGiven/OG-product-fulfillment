const baseSpacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36
};

const baseRadius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 30,
  pill: 999
};

export const spacing = baseSpacing;
export const radius = baseRadius;

export type AppearanceMode = "light" | "dark" | "custom";
export type AccentColor = string;
export type BackgroundColor = string;

type BaseColors = {
  background: string;
  backgroundAccent: string;
  backgroundWash: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  muted: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
};

type AccentColors = {
  primary: string;
  primaryDark: string;
  accent: string;
  accentSoft: string;
};

export type AppTheme = {
  colors: BaseColors & AccentColors;
  radius: typeof baseRadius;
  spacing: typeof baseSpacing;
};

export const defaultAppearance = {
  mode: "light" as AppearanceMode,
  accentColor: "#c56f2a" as AccentColor,
  backgroundColor: null as BackgroundColor | null,
  radiusScale: 1,
  spacingScale: 1
};

const lightBase: BaseColors = {
  background: "#f3ecdf",
  backgroundAccent: "#e8dcc5",
  backgroundWash: "#f3ecdf",
  surface: "#fffaf2",
  surfaceRaised: "#fffdf9",
  text: "#201a14",
  muted: "#6f6253",
  border: "#d7c6ae",
  borderStrong: "#b49d80",
  success: "#2e7d32",
  warning: "#c17b1e",
  danger: "#c0392b",
  dangerSoft: "#fff1ec"
};

const darkBase: BaseColors = {
  background: "#171412",
  backgroundAccent: "#221d19",
  backgroundWash: "#171412",
  surface: "#211c18",
  surfaceRaised: "#2a241f",
  text: "#f7efe6",
  muted: "#c0b3a4",
  border: "#4d4035",
  borderStrong: "#7a6858",
  success: "#6fb56d",
  warning: "#d6a44f",
  danger: "#df7d6e",
  dangerSoft: "#3a221d"
};

function getRelativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const normalize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function clamp(value: number, min = 0, max = 255) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);

  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(hexA: string, hexB: string, amount: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);

  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount
  });
}

function darken(hex: string, amount: number) {
  return mix(hex, "#000000", amount);
}

function soften(hex: string, mode: AppearanceMode) {
  return mode === "dark" ? mix(hex, "#ffffff", 0.14) : mix(hex, "#ffffff", 0.76);
}

function scaleRecord<T extends Record<string, number>>(record: T, scale: number) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, Math.round(value * scale)])
  ) as T;
}

export function buildTheme(
  mode: AppearanceMode = defaultAppearance.mode,
  accentColor: AccentColor = defaultAppearance.accentColor,
  spacingScale = defaultAppearance.spacingScale,
  radiusScale = defaultAppearance.radiusScale,
  backgroundColor: BackgroundColor | null = defaultAppearance.backgroundColor
): AppTheme {
  const presetMode =
    mode === "custom"
      ? getRelativeLuminance(backgroundColor ?? lightBase.background) < 0.38
        ? "dark"
        : "light"
      : mode;
  const base = presetMode === "dark" ? darkBase : lightBase;
  const resolvedBackground = mode === "custom" ? backgroundColor ?? base.background : base.background;
  const resolvedBackgroundAccent =
    presetMode === "dark"
      ? mix(resolvedBackground, "#ffffff", 0.05)
      : mix(resolvedBackground, "#000000", 0.04);
  const resolvedBackgroundWash = toRgba(resolvedBackground, presetMode === "dark" ? 0.92 : 0.86);
  const resolvedSurface =
    presetMode === "dark"
      ? mix(resolvedBackground, "#ffffff", 0.06)
      : mix(resolvedBackground, "#ffffff", 0.6);
  const resolvedSurfaceRaised =
    presetMode === "dark"
      ? mix(resolvedBackground, "#ffffff", 0.1)
      : mix(resolvedBackground, "#ffffff", 0.8);
  const resolvedBorder =
    presetMode === "dark"
      ? mix(resolvedBackground, "#ffffff", 0.18)
      : mix(resolvedBackground, "#000000", 0.12);
  const resolvedBorderStrong =
    presetMode === "dark"
      ? mix(resolvedBackground, "#ffffff", 0.32)
      : mix(resolvedBackground, "#000000", 0.24);

  return {
    colors: {
      ...base,
      background: resolvedBackground,
      backgroundAccent: resolvedBackgroundAccent,
      backgroundWash: resolvedBackgroundWash,
      surface: resolvedSurface,
      surfaceRaised: resolvedSurfaceRaised,
      border: resolvedBorder,
      borderStrong: resolvedBorderStrong,
      primary: darken(accentColor, presetMode === "dark" ? 0.08 : 0.18),
      primaryDark: darken(accentColor, presetMode === "dark" ? 0.24 : 0.36),
      accent: accentColor,
      accentSoft: soften(accentColor, presetMode)
    },
    radius: scaleRecord(baseRadius, radiusScale),
    spacing: scaleRecord(baseSpacing, spacingScale)
  };
}

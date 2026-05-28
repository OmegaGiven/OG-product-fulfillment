import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { getSecureJson, setSecureJson } from "../services/local/localSecureStore";
import {
  buildTheme,
  type BackgroundColor,
  defaultAppearance,
  type AccentColor,
  type AppearanceMode,
  type AppTheme
} from "../theme";

type AppearanceState = {
  mode: AppearanceMode;
  accentColor: AccentColor;
  backgroundColor: BackgroundColor | null;
  radiusScale: number;
  spacingScale: number;
};

type AppearanceContextValue = {
  accentColor: AccentColor;
  backgroundColor: BackgroundColor | null;
  mode: AppearanceMode;
  radiusScale: number;
  reloadAppearance: () => Promise<void>;
  setAccentColor: (accentColor: AccentColor) => Promise<void>;
  setBackgroundColor: (backgroundColor: BackgroundColor | null) => Promise<void>;
  setMode: (mode: AppearanceMode) => Promise<void>;
  setRadiusScale: (radiusScale: number) => Promise<void>;
  setSpacingScale: (spacingScale: number) => Promise<void>;
  spacingScale: number;
  theme: AppTheme;
};

const APPEARANCE_KEY = "appearance-preferences";
const MIN_RADIUS_SCALE = 0;
const MIN_SPACING_SCALE = 0.1;
const MAX_SCALE = 1.5;

function clampRadiusScale(value: number) {
  return Math.min(Math.max(value, MIN_RADIUS_SCALE), MAX_SCALE);
}

function clampSpacingScale(value: number) {
  return Math.min(Math.max(value, MIN_SPACING_SCALE), MAX_SCALE);
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [appearance, setAppearance] = useState<AppearanceState>(defaultAppearance);

  async function loadAppearance() {
    const stored = await getSecureJson<AppearanceState>(APPEARANCE_KEY);
    setAppearance({
      mode: stored?.mode ?? defaultAppearance.mode,
      accentColor:
        typeof stored?.accentColor === "string"
          ? stored.accentColor
          : defaultAppearance.accentColor,
      backgroundColor:
        typeof stored?.backgroundColor === "string"
          ? stored.backgroundColor
          : defaultAppearance.backgroundColor,
      radiusScale:
        typeof stored?.radiusScale === "number"
          ? clampRadiusScale(stored.radiusScale)
          : defaultAppearance.radiusScale,
      spacingScale:
        typeof stored?.spacingScale === "number"
          ? clampSpacingScale(stored.spacingScale)
          : defaultAppearance.spacingScale
    });
  }

  useEffect(() => {
    let isMounted = true;
    void getSecureJson<AppearanceState>(APPEARANCE_KEY).then((stored) => {
      if (!isMounted) {
        return;
      }

      setAppearance({
        mode: stored?.mode ?? defaultAppearance.mode,
        accentColor:
          typeof stored?.accentColor === "string"
            ? stored.accentColor
            : defaultAppearance.accentColor,
        backgroundColor:
          typeof stored?.backgroundColor === "string"
            ? stored.backgroundColor
            : defaultAppearance.backgroundColor,
        radiusScale:
          typeof stored?.radiusScale === "number"
            ? clampRadiusScale(stored.radiusScale)
            : defaultAppearance.radiusScale,
        spacingScale:
          typeof stored?.spacingScale === "number"
            ? clampSpacingScale(stored.spacingScale)
            : defaultAppearance.spacingScale
      });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo<AppearanceContextValue>(() => {
    async function persist(nextAppearance: AppearanceState) {
      setAppearance(nextAppearance);
      await setSecureJson(APPEARANCE_KEY, nextAppearance);
    }

    return {
      accentColor: appearance.accentColor,
      backgroundColor: appearance.backgroundColor,
      mode: appearance.mode,
      radiusScale: appearance.radiusScale,
      reloadAppearance: loadAppearance,
      setAccentColor: async (accentColor: AccentColor) => {
        await persist({ ...appearance, accentColor });
      },
      setBackgroundColor: async (backgroundColor: BackgroundColor | null) => {
        await persist({
          ...appearance,
          backgroundColor,
          mode: backgroundColor ? "custom" : appearance.mode === "custom" ? defaultAppearance.mode : appearance.mode
        });
      },
      setMode: async (mode: AppearanceMode) => {
        await persist({
          ...appearance,
          mode,
          backgroundColor: mode === "custom" ? appearance.backgroundColor : null
        });
      },
      setRadiusScale: async (radiusScale: number) => {
        await persist({ ...appearance, radiusScale: clampRadiusScale(radiusScale) });
      },
      setSpacingScale: async (spacingScale: number) => {
        await persist({ ...appearance, spacingScale: clampSpacingScale(spacingScale) });
      },
      spacingScale: appearance.spacingScale,
      theme: buildTheme(
        appearance.mode,
        appearance.accentColor,
        appearance.spacingScale,
        appearance.radiusScale,
        appearance.backgroundColor
      )
    };
  }, [appearance]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const backgroundColor = value.theme.colors.background;
    const backgroundImage = [
      `radial-gradient(circle at top left, ${value.theme.colors.accentSoft} 0%, transparent 34%)`,
      `radial-gradient(circle at top right, ${value.theme.colors.backgroundAccent} 0%, transparent 38%)`,
      `linear-gradient(180deg, ${value.theme.colors.backgroundAccent} 0%, ${backgroundColor} 58%, ${backgroundColor} 100%)`
    ].join(", ");
    const root = document.documentElement;
    const body = document.body;
    const appRoot = document.getElementById("root");
    const expoRoot = document.querySelector("[data-expo-root]") as HTMLElement | null;
    const firstBodyChild = body.firstElementChild as HTMLElement | null;
    const previousRootBackground = root.style.backgroundColor;
    const previousRootBackgroundImage = root.style.backgroundImage;
    const previousBodyBackground = body.style.backgroundColor;
    const previousBodyBackgroundImage = body.style.backgroundImage;
    const previousBodyBackgroundAttachment = body.style.backgroundAttachment;
    const previousBodyBackgroundRepeat = body.style.backgroundRepeat;
    const previousBodyBackgroundSize = body.style.backgroundSize;
    const previousAppRootBackground = appRoot?.style.backgroundColor ?? "";
    const previousExpoRootBackground = expoRoot?.style.backgroundColor ?? "";
    const previousFirstBodyChildBackground = firstBodyChild?.style.backgroundColor ?? "";

    root.style.backgroundColor = backgroundColor;
    root.style.backgroundImage = backgroundImage;
    body.style.backgroundColor = backgroundColor;
    body.style.backgroundImage = backgroundImage;
    body.style.backgroundAttachment = "fixed";
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    if (appRoot) {
      appRoot.style.backgroundColor = backgroundColor;
    }
    if (expoRoot) {
      expoRoot.style.backgroundColor = backgroundColor;
    }
    if (firstBodyChild) {
      firstBodyChild.style.backgroundColor = backgroundColor;
    }

    return () => {
      root.style.backgroundColor = previousRootBackground;
      root.style.backgroundImage = previousRootBackgroundImage;
      body.style.backgroundColor = previousBodyBackground;
      body.style.backgroundImage = previousBodyBackgroundImage;
      body.style.backgroundAttachment = previousBodyBackgroundAttachment;
      body.style.backgroundRepeat = previousBodyBackgroundRepeat;
      body.style.backgroundSize = previousBodyBackgroundSize;
      if (appRoot) {
        appRoot.style.backgroundColor = previousAppRootBackground;
      }
      if (expoRoot) {
        expoRoot.style.backgroundColor = previousExpoRootBackground;
      }
      if (firstBodyChild) {
        firstBodyChild.style.backgroundColor = previousFirstBodyChildBackground;
      }
    };
  }, [
    value.theme.colors.accentSoft,
    value.theme.colors.background,
    value.theme.colors.backgroundAccent
  ]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside AppearanceProvider.");
  }
  return context;
}

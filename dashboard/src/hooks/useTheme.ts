import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
export type ThemePalette = "modern" | "classic";

const MODE_STORAGE_KEY = "clippy.theme";
const PALETTE_STORAGE_KEY = "clippy.themePalette";
const DEFAULT_PREFERENCE: ThemePreference = "dark";
const DEFAULT_PALETTE: ThemePalette = "modern";
const THEME_PALETTES: readonly ThemePalette[] = ["modern", "classic"];

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function isThemePalette(value: string | null): value is ThemePalette {
  return value != null && (THEME_PALETTES as readonly string[]).includes(value);
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function readPalette(): ThemePalette {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    return isThemePalette(stored) ? stored : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

export function applyTheme(pref: ThemePreference, palette: ThemePalette = readPalette()) {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.palette = palette;
  document.documentElement.style.colorScheme = resolved;
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  palette: ThemePalette;
  setPreference: (next: ThemePreference) => void;
  setPalette: (next: ThemePalette) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [palette, setPaletteState] = useState<ThemePalette>(readPalette);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    applyTheme(preference, palette);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, preference);
      localStorage.setItem(PALETTE_STORAGE_KEY, palette);
    } catch {
      /* ignore quota / private mode */
    }
  }, [preference, palette]);

  useEffect(() => {
    if (preference === "system") {
      applyTheme("system", palette);
    }
  }, [preference, systemTheme, palette]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemTheme(mq.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = preference === "system" ? systemTheme : preference;

  const value = useMemo(
    () => ({
      preference,
      resolved,
      palette,
      setPreference: setPreferenceState,
      setPalette: setPaletteState,
    }),
    [preference, resolved, palette],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

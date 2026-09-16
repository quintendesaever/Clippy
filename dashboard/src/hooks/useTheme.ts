import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Single appearance control: modern dark, classic/OG dark, or light. */
export type Appearance = "modern" | "classic" | "light";
export type ResolvedTheme = "dark" | "light";
export type ThemePalette = "modern" | "classic";

const APPEARANCE_KEY = "clippy.appearance";
const LEGACY_MODE_KEY = "clippy.theme";
const LEGACY_PALETTE_KEY = "clippy.themePalette";
const DEFAULT_APPEARANCE: Appearance = "classic";
const APPEARANCES: readonly Appearance[] = ["modern", "classic", "light"];

function isAppearance(value: string | null): value is Appearance {
  return value != null && (APPEARANCES as readonly string[]).includes(value);
}

/** Map a preset to DOM theme + palette attributes. */
export function appearanceToAttrs(appearance: Appearance): {
  theme: ResolvedTheme;
  palette: ThemePalette;
} {
  if (appearance === "light") return { theme: "light", palette: "modern" };
  if (appearance === "classic") return { theme: "dark", palette: "classic" };
  return { theme: "dark", palette: "modern" };
}

function migrateLegacyAppearance(): Appearance | null {
  try {
    const legacyMode = localStorage.getItem(LEGACY_MODE_KEY);
    const legacyPalette = localStorage.getItem(LEGACY_PALETTE_KEY);
    if (isAppearance(legacyMode)) return legacyMode;
    if (legacyMode === "light") return "light";
    if (legacyPalette === "classic") return "classic";
    if (legacyMode === "dark" || legacyMode === "system") return "modern";
  } catch {
    /* ignore */
  }
  return null;
}

function readAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEY);
    if (isAppearance(stored)) return stored;
    const migrated = migrateLegacyAppearance();
    if (migrated) return migrated;
  } catch {
    /* ignore */
  }
  return DEFAULT_APPEARANCE;
}

export function applyAppearance(appearance: Appearance) {
  const { theme, palette } = appearanceToAttrs(appearance);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  document.documentElement.style.colorScheme = theme;
}

type ThemeContextValue = {
  appearance: Appearance;
  resolved: ResolvedTheme;
  setAppearance: (next: Appearance) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readAppearance);

  useEffect(() => {
    applyAppearance(appearance);
    try {
      localStorage.setItem(APPEARANCE_KEY, appearance);
      // Drop legacy keys so boot script and Settings stay in sync.
      localStorage.removeItem(LEGACY_MODE_KEY);
      localStorage.removeItem(LEGACY_PALETTE_KEY);
    } catch {
      /* ignore quota / private mode */
    }
  }, [appearance]);

  const resolved = appearanceToAttrs(appearance).theme;

  const value = useMemo(
    () => ({
      appearance,
      resolved,
      setAppearance: setAppearanceState,
    }),
    [appearance, resolved]
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

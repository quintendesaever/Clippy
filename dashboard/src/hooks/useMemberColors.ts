import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "clippy.showMemberColors";

function readShowMemberColors(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type MemberColorsContextValue = {
  showMemberColors: boolean;
  setShowMemberColors: (next: boolean) => void;
};

const MemberColorsContext = createContext<MemberColorsContextValue | null>(null);

export function MemberColorsProvider({ children }: { children: ReactNode }) {
  const [showMemberColors, setShowMemberColorsState] = useState(readShowMemberColors);

  const setShowMemberColors = useCallback((next: boolean) => {
    setShowMemberColorsState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ showMemberColors, setShowMemberColors }),
    [showMemberColors, setShowMemberColors]
  );

  return createElement(MemberColorsContext.Provider, { value }, children);
}

export function useMemberColors(): MemberColorsContextValue {
  const ctx = useContext(MemberColorsContext);
  if (!ctx) {
    throw new Error("useMemberColors must be used within MemberColorsProvider");
  }
  return ctx;
}

/** Single member: solid accent. Multiple: equal segments along the card's top edge. */
export function memberAccentStyle(colors: string[]): Record<string, string> | undefined {
  const unique = [...new Set(colors.filter(isCssHexColor))];
  if (unique.length === 0) return undefined;
  if (unique.length === 1) {
    return {
      "--member-color": unique[0]!,
      "--member-strip": unique[0]!,
    };
  }
  const step = 100 / unique.length;
  const stops = unique
    .map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`)
    .join(", ");
  return {
    "--member-color": unique[0]!,
    "--member-strip": `linear-gradient(90deg, ${stops})`,
  };
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function isCssHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r1, g1, b1] =
    section < 1 ? [chroma, x, 0] :
    section < 2 ? [x, chroma, 0] :
    section < 3 ? [0, chroma, x] :
    section < 4 ? [0, x, chroma] :
    section < 5 ? [x, 0, chroma] :
    [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${[r1, g1, b1]
    .map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Assign visibly distinct colors across the members currently on screen.
 * Sorting keeps the assignment deterministic; the golden-angle step avoids palette collisions.
 */
export function buildMemberColorMap(userIds: Iterable<string>): Map<string, string> {
  const ids = [...new Set(userIds)].sort();
  return new Map(
    ids.map((userId, index) => [
      userId,
      hslToHex((225 + index * 137.508) % 360, 72, 58),
    ])
  );
}

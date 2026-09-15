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

/** Single member: solid accent. Multiple: equal vertical stripes (activities/groups). */
export function memberAccentStyle(colors: string[]): Record<string, string> | undefined {
  const unique = [...new Set(colors.filter(Boolean))];
  if (unique.length === 0) return undefined;
  if (unique.length === 1) {
    return {
      "--member-color": unique[0]!,
      "--member-stripe": unique[0]!,
    };
  }
  const step = 100 / unique.length;
  const stops = unique
    .map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`)
    .join(", ");
  return {
    "--member-color": unique[0]!,
    "--member-stripe": `linear-gradient(180deg, ${stops})`,
  };
}

const FALLBACK_COLORS = [
  "#a855f7",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#3b82f6",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
];

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]!;
}

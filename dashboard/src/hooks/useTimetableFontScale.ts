import { useState } from "react";

const STORAGE_KEY = "clippy.timetableFontScale";
const STEPS = [
  0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4,
  1.45, 1.5,
] as const;
const DEFAULT_SCALE = 1;

export type TimetableFontScale = (typeof STEPS)[number];

function isScale(value: number): value is TimetableFontScale {
  return (STEPS as readonly number[]).includes(value);
}

function readScale(): TimetableFontScale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_SCALE;
    const parsed = Number(raw);
    return isScale(parsed) ? parsed : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

function persist(next: TimetableFontScale) {
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useTimetableFontScale() {
  const [scale, setScaleState] = useState<TimetableFontScale>(readScale);
  const index = STEPS.indexOf(scale);

  function decrease() {
    const next = STEPS[index - 1];
    if (next == null) return;
    setScaleState(next);
    persist(next);
  }

  function increase() {
    const next = STEPS[index + 1];
    if (next == null) return;
    setScaleState(next);
    persist(next);
  }

  return {
    scale,
    decrease,
    increase,
    canDecrease: index > 0,
    canIncrease: index < STEPS.length - 1,
  };
}

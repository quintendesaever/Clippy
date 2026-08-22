import { useState } from "react";
import { useIsMobile } from "./useMediaQuery";

export type TimetableLayout = "agenda" | "timeline";

const STORAGE_KEY = "clippy.timetableLayout";

function readLayout(isMobile: boolean): TimetableLayout {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "agenda" || stored === "timeline") return stored;
  } catch {
    /* ignore */
  }
  return isMobile ? "agenda" : "timeline";
}

export function useTimetableLayout() {
  const isMobile = useIsMobile();
  const [layout, setLayoutState] = useState<TimetableLayout>(() => readLayout(isMobile));

  function setLayout(next: TimetableLayout) {
    setLayoutState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }

  return {
    isMobile,
    layout,
    setLayout,
    showToggle: isMobile,
    useAgenda: isMobile && layout === "agenda",
  };
}

import { useState } from "react";
import { useIsMobile } from "./useMediaQuery";

export type TimetableLayout = "agenda" | "timeline";

const STORAGE_KEY = "clippy.timetableLayout";

function readLayout(): TimetableLayout {
  try {
    return localStorage.getItem(STORAGE_KEY) === "agenda" ? "agenda" : "timeline";
  } catch {
    return "timeline";
  }
}

export function useTimetableLayout() {
  const isMobile = useIsMobile();
  const [layout, setLayoutState] = useState<TimetableLayout>(readLayout);

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

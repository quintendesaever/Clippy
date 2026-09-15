import type { ReactNode } from "react";
import type { TimetableLayout } from "../hooks/useTimetableLayout";
import { formatWeekRange } from "../lib/dates";
import TimetableLayoutToggle from "./TimetableLayoutToggle";
import WeekNav from "./WeekNav";

type TimetableToolbarProps = {
  dayDates: string[];
  loading: boolean;
  onPrev: () => void;
  onThisWeek: () => void;
  onNext: () => void;
  showToggle?: boolean;
  layout?: TimetableLayout;
  onLayoutChange?: (layout: TimetableLayout) => void;
  timelineLabel?: string;
  isCurrentWeek?: boolean;
  filter?: ReactNode;
};

export default function TimetableToolbar({
  dayDates,
  loading,
  onPrev,
  onThisWeek,
  onNext,
  showToggle = false,
  layout,
  onLayoutChange,
  timelineLabel,
  isCurrentWeek = false,
  filter,
}: TimetableToolbarProps) {
  const hasRange = dayDates.length > 0;

  return (
    <div className="timetableToolbar">
      <WeekNav
        onPrev={onPrev}
        onThisWeek={onThisWeek}
        onNext={onNext}
        disabled={loading}
      />
      {showToggle && layout && onLayoutChange && (
        <TimetableLayoutToggle
          value={layout}
          onChange={onLayoutChange}
          timelineLabel={timelineLabel}
        />
      )}
      <span className={`timetableWeekLabel${loading ? " timetableWeekLabelLoading" : ""}`}>
        <span className="timetableWeekRange">
          {hasRange ? formatWeekRange(dayDates[0], dayDates[dayDates.length - 1]) : ""}
          {isCurrentWeek && !loading && (
            <span className="timetableWeekNow" aria-label="Huidige week">
              Nu
            </span>
          )}
        </span>
        {loading && (
          <span className="timetableLoading" role="status">
            Rooster laden…
          </span>
        )}
      </span>
      {filter}
    </div>
  );
}

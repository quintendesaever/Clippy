import { useMemo } from "react";
import {
  barColor,
  computeBusySlots,
  DEFAULT_HOUR_END,
  DEFAULT_HOUR_START,
  hourLabels,
  type DayAvailabilityInput,
} from "../lib/availability";
import { formatDayMonth } from "../lib/dates";

type WeekAvailabilityChartProps = {
  days: DayAvailabilityInput[];
  hourStart?: number;
  hourEnd?: number;
};

export default function WeekAvailabilityChart({
  days,
  hourStart = DEFAULT_HOUR_START,
  hourEnd = DEFAULT_HOUR_END,
}: WeekAvailabilityChartProps) {
  const slotsByDay = useMemo(
    () => days.map((day) => ({ ...day, slots: computeBusySlots(day.events, hourStart, hourEnd) })),
    [days, hourStart, hourEnd]
  );

  const maxCount = useMemo(() => {
    const counts = slotsByDay.flatMap((d) => d.slots.map((s) => s.busyCount));
    return Math.max(1, ...counts, 0);
  }, [slotsByDay]);

  const hours = hourLabels(hourStart, hourEnd);
  const hourCount = hours.length;

  if (days.length === 0) return null;

  return (
    <div className="availabilityChart availabilityWeekChart">
      <div className="availabilityWeek">
        {slotsByDay.map((day) => (
          <div key={day.dayKey} className="availabilityDayColumn">
            <div className="availabilityDayColumnLabel">
              {day.dayLabel} {formatDayMonth(day.dayKey)}
            </div>
            <div className="availabilityChartBars availabilityDayColumnBars">
              {Array.from({ length: hourCount + 1 }, (_, i) => (
                <div
                  key={i}
                  className="availabilityGridLine"
                  style={{ left: `${(i / hourCount) * 100}%` }}
                />
              ))}
              {day.slots.map((slot) => {
                const heightPct = (slot.busyCount / maxCount) * 100;
                return (
                  <div key={slot.startMinutes} className="availabilityChartBarWrap">
                    <span className="availabilityChartBarLabel">{slot.busyCount}</span>
                    <div
                      className="availabilityChartBar"
                      style={{
                        height: `${Math.max(heightPct, slot.busyCount > 0 ? 8 : 0)}%`,
                        backgroundColor: barColor(slot.busyCount),
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="availabilityWeekAxis">
        {hours.map((hour) => (
          <span key={hour} className="availabilityChartHour">
            {hour}
          </span>
        ))}
      </div>

      <p className="availabilityCaption">
        Staafhoogte = aantal bezette personen per half uur.
      </p>
    </div>
  );
}

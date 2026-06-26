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

const BAR_AREA_HEIGHT = 100;

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
              {day.slots.map((slot) => {
                const barHeight =
                  slot.busyCount > 0
                    ? Math.max(6, (slot.busyCount / maxCount) * BAR_AREA_HEIGHT)
                    : 0;
                return (
                  <div key={slot.startMinutes} className="availabilityChartBarWrap">
                    <span className="availabilityChartBarLabel">{slot.busyCount}</span>
                    <div
                      className="availabilityChartBar"
                      style={{
                        height: `${barHeight}px`,
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
    </div>
  );
}

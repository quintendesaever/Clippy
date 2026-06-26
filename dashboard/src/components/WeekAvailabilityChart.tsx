import { useMemo } from "react";
import {
  barColor,
  computeBusySlots,
  computeWeekBestWindows,
  DEFAULT_HOUR_END,
  DEFAULT_HOUR_START,
  formatTimeRange,
  hourLabels,
  type DayAvailabilityInput,
} from "../lib/availability";
import { formatDayMonth } from "../lib/dates";

type WeekAvailabilityChartProps = {
  days: DayAvailabilityInput[];
  hourStart?: number;
  hourEnd?: number;
  maxBusy?: number;
};

export default function WeekAvailabilityChart({
  days,
  hourStart = DEFAULT_HOUR_START,
  hourEnd = DEFAULT_HOUR_END,
  maxBusy = 2,
}: WeekAvailabilityChartProps) {
  const slotsByDay = useMemo(
    () => days.map((day) => ({ ...day, slots: computeBusySlots(day.events, hourStart, hourEnd) })),
    [days, hourStart, hourEnd]
  );

  const maxCount = useMemo(() => {
    const counts = slotsByDay.flatMap((d) => d.slots.map((s) => s.busyCount));
    return Math.max(1, ...counts, 0);
  }, [slotsByDay]);

  const bestWindows = useMemo(
    () => computeWeekBestWindows(days, maxBusy, hourStart, hourEnd),
    [days, maxBusy, hourStart, hourEnd]
  );

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

      <div className="availabilityBestWindows">
        <p className="availabilityBestTitle">Beste vensters (≤{maxBusy} personen bezet)</p>
        {bestWindows.length > 0 ? (
          <div className="availabilityBestPills">
            {bestWindows.map((entry) => (
              <span
                key={`${entry.dayKey}-${entry.range.startMinutes}-${entry.range.endMinutes}`}
                className="availabilityPill"
              >
                {entry.dayLabel} {formatTimeRange(entry.range)}
              </span>
            ))}
          </div>
        ) : (
          <p className="availabilityBestEmpty">Geen vrije vensters deze week.</p>
        )}
      </div>

      <p className="availabilityCaption">
        Staafhoogte = aantal bezette personen. Groene slots = beste momenten om iets in te plannen.
      </p>
    </div>
  );
}

import { useMemo } from "react";
import {
  barColor,
  computeBusySlots,
  DEFAULT_HOUR_END,
  DEFAULT_HOUR_START,
  findBestWindows,
  formatTimeRange,
  hourLabels,
} from "../lib/availability";
import type { TimetableEventDto } from "../types";

type AvailabilityChartProps = {
  events: TimetableEventDto[];
  hourStart?: number;
  hourEnd?: number;
  maxBusy?: number;
};

export default function AvailabilityChart({
  events,
  hourStart = DEFAULT_HOUR_START,
  hourEnd = DEFAULT_HOUR_END,
  maxBusy = 2,
}: AvailabilityChartProps) {
  const slots = useMemo(
    () => computeBusySlots(events, hourStart, hourEnd),
    [events, hourStart, hourEnd]
  );

  const bestWindows = useMemo(
    () => findBestWindows(slots, maxBusy),
    [slots, maxBusy]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...slots.map((s) => s.busyCount)),
    [slots]
  );

  const hours = hourLabels(hourStart, hourEnd);

  if (slots.length === 0) return null;

  return (
    <div className="availabilityChart">
      <div className="availabilityChartPlot">
        <div className="availabilityChartBars">
          {slots.map((slot) => {
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
        <div
          className="availabilityChartAxis"
          style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}
        >
          {hours.map((hour) => (
            <span
              key={hour}
              className="availabilityChartHour"
              style={{
                gridColumn: hour === hourEnd ? slots.length : (hour - hourStart) * 2 + 1,
              }}
            >
              {hour}
            </span>
          ))}
        </div>
      </div>

      <div className="availabilityBestWindows">
        <p className="availabilityBestTitle">Beste vensters (≤{maxBusy} personen bezet)</p>
        {bestWindows.length > 0 ? (
          <div className="availabilityBestPills">
            {bestWindows.map((range) => (
              <span key={`${range.startMinutes}-${range.endMinutes}`} className="availabilityPill">
                {formatTimeRange(range)}
              </span>
            ))}
          </div>
        ) : (
          <p className="availabilityBestEmpty">Geen vrije vensters op deze dag.</p>
        )}
      </div>

      <p className="availabilityCaption">
        Staafhoogte = aantal bezette personen. Groene slots = beste momenten om iets in te plannen.
      </p>
    </div>
  );
}

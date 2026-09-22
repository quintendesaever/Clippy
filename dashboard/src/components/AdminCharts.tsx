import { useEffect, useMemo, useRef, useState } from "react";

type NamedCount = { label: string; value: number };

const MONTHS_NL = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** Format ISO day (YYYY-MM-DD), month (YYYY-MM), or hour-ish keys for display. */
export function formatChartLabel(label: string, style: "short" | "full" = "short"): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (dayMatch) {
    const month = MONTHS_NL[Number(dayMatch[2]) - 1] ?? dayMatch[2];
    const day = String(Number(dayMatch[3]));
    if (style === "full") return `${day} ${month} ${dayMatch[1]}`;
    return `${day} ${month}`;
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(label);
  if (monthMatch) {
    const month = MONTHS_NL[Number(monthMatch[2]) - 1] ?? monthMatch[2];
    return style === "full" ? `${month} ${monthMatch[1]}` : month;
  }

  const hourMatch = /^(\d{1,2})(?::00)?$/.exec(label);
  if (hourMatch) {
    const hour = Number(hourMatch[1]);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  return label;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("nl-BE").format(value);
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  if (max === 1) return [0, 1];
  const mid = Math.round(max / 2);
  return mid === 0 || mid === max ? [0, max] : [0, mid, max];
}

function ChartTooltip({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="adminChartTooltip" role="status">
      <span className="adminChartTooltipTitle">{title}</span>
      <span className="adminChartTooltipValue">{value}</span>
      {detail && <span className="adminChartTooltipDetail">{detail}</span>}
    </div>
  );
}

export function BarList({
  items,
  empty,
}: {
  items: NamedCount[];
  empty: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) return <p className="cardHint">{empty}</p>;
  return (
    <div className="adminBars">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="adminBarRow"
          title={`${item.label}: ${formatCount(item.value)}`}
        >
          <span className="adminBarLabel" title={item.label}>
            {item.label}
          </span>
          <div className="adminBarTrack">
            <div
              className="adminBarFill"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="adminBarValue">{formatCount(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars for 24h peak hours — intensity + height. */
export function HourChart({ hours }: { hours: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...hours.map((item) => item.count));
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const active = activeHour == null ? null : hours.find((item) => item.hour === activeHour) ?? null;

  return (
    <div className="adminHourChartWrap">
      <div className="adminHourChartScale" aria-hidden="true">
        <span>{formatCount(max)}</span>
        <span>0</span>
      </div>
      <div
        className="adminHourChart"
        role="group"
        aria-label="Piekuren"
        onMouseLeave={() => setActiveHour(null)}
      >
        {hours.map((item) => {
          const intensity = item.count > 0 ? Math.max(0.2, item.count / max) : 0;
          const selected = activeHour === item.hour;
          return (
            <button
              key={item.hour}
              type="button"
              className={`adminHourCol${selected ? " adminHourColActive" : ""}`}
              aria-label={`${String(item.hour).padStart(2, "0")}:00, ${formatCount(item.count)}`}
              aria-pressed={selected}
              onMouseEnter={() => setActiveHour(item.hour)}
              onFocus={() => setActiveHour(item.hour)}
              onClick={() => setActiveHour(item.hour)}
            >
              <div
                className="adminHourBar"
                style={{
                  height: `${item.count > 0 ? Math.max(8, (item.count / max) * 100) : 0}%`,
                  opacity: item.count > 0 ? 0.35 + intensity * 0.65 : 0.15,
                }}
              />
              {item.hour % 3 === 0 && (
                <span className="adminHourLabel">{String(item.hour).padStart(2, "0")}:00</span>
              )}
            </button>
          );
        })}
      </div>
      {active && (
        <ChartTooltip
          title={`${String(active.hour).padStart(2, "0")}:00`}
          value={formatCount(active.count)}
          detail="uur van de dag"
        />
      )}
    </div>
  );
}

/** Compact day-of-week intensity strip. */
export function DayHeatmap({
  days,
  empty,
}: {
  days: { day: string; count: number }[];
  empty: string;
}) {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  if (days.length === 0) return <p className="cardHint">{empty}</p>;
  const max = Math.max(1, ...days.map((item) => item.count));
  const active = activeDay == null ? null : days.find((item) => item.day === activeDay) ?? null;

  return (
    <div className="adminDayHeatmapWrap">
      <div
        className="adminDayHeatmap"
        role="group"
        aria-label="Piekdagen"
        onMouseLeave={() => setActiveDay(null)}
      >
        {days.map((item) => {
          const intensity = item.count > 0 ? Math.max(0.15, item.count / max) : 0;
          const selected = activeDay === item.day;
          return (
            <button
              key={item.day}
              type="button"
              className={`adminDayHeatCell${selected ? " adminDayHeatCellActive" : ""}`}
              aria-pressed={selected}
              aria-label={`${item.day}: ${formatCount(item.count)}`}
              onMouseEnter={() => setActiveDay(item.day)}
              onFocus={() => setActiveDay(item.day)}
              onClick={() => setActiveDay(item.day)}
              style={{
                background:
                  item.count > 0
                    ? `color-mix(in srgb, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-bg-hover))`
                    : "var(--color-bg-hover)",
              }}
            >
              <span className="adminDayHeatLabel">{item.day.slice(0, 2)}</span>
              <span className="adminDayHeatValue">{formatCount(item.count)}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <ChartTooltip title={active.day} value={formatCount(active.count)} detail="weekdag" />
      )}
    </div>
  );
}

/** SVG area/line chart for daily/monthly series. */
export function AreaChart({
  items,
  empty,
  ariaLabel = "Tijdreeks",
  valueLabel = "waarde",
}: {
  items: NamedCount[];
  empty: string;
  ariaLabel?: string;
  valueLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(480);

  const height = 160;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 28;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const apply = (next: number) => {
      const rounded = Math.max(280, Math.round(next));
      setWidth((prev) => (Math.abs(prev - rounded) < 1 ? prev : rounded));
    };

    apply(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      apply(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chart = useMemo(() => {
    if (items.length === 0) return null;
    const max = Math.max(1, ...items.map((item) => item.value));
    const span = Math.max(1, items.length - 1);
    const coords = items.map((item, index) => {
      const x = padL + (index / span) * (width - padL - padR);
      const y = padT + (1 - item.value / max) * (height - padT - padB);
      return { x, y, ...item };
    });
    const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
    const area = [
      `${coords[0].x},${height - padB}`,
      ...coords.map((point) => `${point.x},${point.y}`),
      `${coords[coords.length - 1].x},${height - padB}`,
    ].join(" ");
    const yTicks = niceTicks(max);
    const xLabelIndexes = (() => {
      if (items.length <= 4) return items.map((_, index) => index);
      const mid = Math.floor((items.length - 1) / 2);
      return Array.from(new Set([0, mid, items.length - 1])).sort((a, b) => a - b);
    })();
    return { max, coords, line, area, yTicks, xLabelIndexes };
  }, [items, width]);

  if (!chart) return <p className="cardHint">{empty}</p>;

  const { max, coords, line, area, yTicks, xLabelIndexes } = chart;
  const active = activeIndex == null ? null : coords[activeIndex] ?? null;

  function indexFromClientX(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg || coords.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    coords.forEach((point, index) => {
      const dist = Math.abs(point.x - x);
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    });
    return best;
  }

  function onPointer(clientX: number) {
    const next = indexFromClientX(clientX);
    if (next != null) setActiveIndex(next);
  }

  return (
    <div
      ref={wrapRef}
      className="adminAreaChart"
      onMouseLeave={() => setActiveIndex(null)}
    >
      <svg
        ref={svgRef}
        className="adminAreaSvg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          onPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || event.buttons > 0 || event.pressure > 0) {
            onPointer(event.clientX);
          }
        }}
      >
        {yTicks.map((tick) => {
          const y = padT + (1 - tick / max) * (height - padT - padB);
          return (
            <g key={`y-${tick}`}>
              <line
                className="adminAreaGrid"
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
              />
              <text className="adminAreaYLabel" x={padL - 6} y={y} textAnchor="end" dominantBaseline="middle">
                {formatCount(tick)}
              </text>
            </g>
          );
        })}

        <polygon className="adminAreaFill" points={area} />
        <polyline className="adminAreaLine" points={line} fill="none" />

        {coords.map((point, index) =>
          point.value > 0 ? (
            <circle
              key={`${point.label}-${index}`}
              className={`adminAreaDot${activeIndex === index ? " adminAreaDotActive" : ""}`}
              cx={point.x}
              cy={point.y}
              r={activeIndex === index ? 4 : 2.5}
            />
          ) : null
        )}

        {active && (
          <line
            className="adminAreaCrosshair"
            x1={active.x}
            x2={active.x}
            y1={padT}
            y2={height - padB}
          />
        )}

        {xLabelIndexes.map((index) => {
          const point = coords[index];
          return (
            <text
              key={`x-${point.label}-${index}`}
              className="adminAreaXLabel"
              x={point.x}
              y={height - 8}
              textAnchor={
                index === 0 ? "start" : index === coords.length - 1 ? "end" : "middle"
              }
            >
              {formatChartLabel(point.label, "short")}
            </text>
          );
        })}
      </svg>

      {active && (
        <ChartTooltip
          title={formatChartLabel(active.label, "full")}
          value={formatCount(active.value)}
          detail={valueLabel}
        />
      )}
    </div>
  );
}

const DONUT_COLORS = [
  "var(--color-accent)",
  "#57f287",
  "#fee75c",
  "#eb459e",
  "#ed4245",
  "#949ba4",
];

/** Part-to-whole donut for small categorical sets. */
export function DonutChart({
  items,
  empty,
  ariaLabel = "Verdeling",
}: {
  items: NamedCount[];
  empty: string;
  ariaLabel?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (items.length === 0) return <p className="cardHint">{empty}</p>;

  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const size = 120;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const active = activeIndex == null ? null : items[activeIndex] ?? null;

  return (
    <div className="adminDonutWrap" onMouseLeave={() => setActiveIndex(null)}>
      <svg
        className="adminDonutSvg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-bg-hover)"
          strokeWidth={stroke}
        />
        {items.map((item, index) => {
          const length = (item.value / total) * circumference;
          const selected = activeIndex === index;
          const circle = (
            <circle
              key={`${item.label}-${index}`}
              className={selected ? "adminDonutSegmentActive" : undefined}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
              strokeWidth={selected ? stroke + 2 : stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ cursor: "pointer", opacity: activeIndex == null || selected ? 1 : 0.45 }}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <title>
                {item.label}: {formatCount(item.value)} (
                {Math.round((item.value / total) * 100)}%)
              </title>
            </circle>
          );
          offset += length;
          return circle;
        })}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="adminDonutCenter"
        >
          {active ? formatCount(active.value) : formatCount(total)}
        </text>
      </svg>
      <ul className="adminDonutLegend">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <button
              type="button"
              className={`adminDonutLegendBtn${
                activeIndex === index ? " adminDonutLegendBtnActive" : ""
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <span
                className="adminDonutSwatch"
                style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}
              />
              <span className="adminDonutLegendLabel">{item.label}</span>
              <span className="adminDonutLegendValue">
                {formatCount(item.value)}
                <span className="adminDonutLegendPct">
                  {" "}
                  ({Math.round((item.value / total) * 100)}%)
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {active && (
        <ChartTooltip
          title={active.label}
          value={`${formatCount(active.value)} · ${Math.round((active.value / total) * 100)}%`}
          detail="deel van totaal"
        />
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={`adminStatCard${compact ? " adminStatCardCompact" : ""}`}>
      <p className="adminStatLabel">{label}</p>
      <p className="adminStatValue">{value}</p>
      {hint && <p className="adminStatHint">{hint}</p>}
    </div>
  );
}

type NamedCount = { label: string; value: number };

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
        <div key={`${item.label}-${index}`} className="adminBarRow">
          <span className="adminBarLabel" title={item.label}>
            {item.label}
          </span>
          <div className="adminBarTrack">
            <div
              className="adminBarFill"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="adminBarValue">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars for 24h peak hours — intensity + height. */
export function HourChart({ hours }: { hours: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...hours.map((item) => item.count));
  return (
    <div className="adminHourChart" role="img" aria-label="Piekuren">
      {hours.map((item) => {
        const intensity = item.count > 0 ? Math.max(0.2, item.count / max) : 0;
        return (
          <div key={item.hour} className="adminHourCol" title={`${item.hour}:00 · ${item.count}`}>
            <div
              className="adminHourBar"
              style={{
                height: `${item.count > 0 ? Math.max(8, (item.count / max) * 100) : 0}%`,
                opacity: item.count > 0 ? 0.35 + intensity * 0.65 : 0.15,
              }}
            />
            {item.hour % 3 === 0 && <span className="adminHourLabel">{item.hour}</span>}
          </div>
        );
      })}
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
  if (days.length === 0) return <p className="cardHint">{empty}</p>;
  const max = Math.max(1, ...days.map((item) => item.count));
  return (
    <div className="adminDayHeatmap" role="img" aria-label="Piekdagen">
      {days.map((item) => {
        const intensity = item.count > 0 ? Math.max(0.15, item.count / max) : 0;
        return (
          <div
            key={item.day}
            className="adminDayHeatCell"
            title={`${item.day}: ${item.count}`}
            style={{
              background:
                item.count > 0
                  ? `color-mix(in srgb, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-bg-hover))`
                  : "var(--color-bg-hover)",
            }}
          >
            <span className="adminDayHeatLabel">{item.day.slice(0, 2)}</span>
            <span className="adminDayHeatValue">{item.count}</span>
          </div>
        );
      })}
    </div>
  );
}

/** SVG area/line chart for daily series. */
export function AreaChart({
  items,
  empty,
  ariaLabel = "Tijdreeks",
}: {
  items: NamedCount[];
  empty: string;
  ariaLabel?: string;
}) {
  if (items.length === 0) return <p className="cardHint">{empty}</p>;

  const width = 480;
  const height = 140;
  const padX = 8;
  const padY = 12;
  const max = Math.max(1, ...items.map((item) => item.value));
  const span = Math.max(1, items.length - 1);

  const coords = items.map((item, index) => {
    const x = padX + (index / span) * (width - padX * 2);
    const y = height - padY - (item.value / max) * (height - padY * 2);
    return { x, y, ...item };
  });

  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = [
    `${coords[0].x},${height - padY}`,
    ...coords.map((point) => `${point.x},${point.y}`),
    `${coords[coords.length - 1].x},${height - padY}`,
  ].join(" ");

  const first = items[0]?.label ?? "";
  const last = items[items.length - 1]?.label ?? "";

  return (
    <div className="adminAreaChart">
      <svg
        className="adminAreaSvg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        <polygon className="adminAreaFill" points={area} />
        <polyline className="adminAreaLine" points={line} fill="none" />
        {coords.map((point, index) =>
          point.value > 0 ? (
            <circle
              key={`${point.label}-${index}`}
              className="adminAreaDot"
              cx={point.x}
              cy={point.y}
              r={2.5}
            >
              <title>
                {point.label}: {point.value}
              </title>
            </circle>
          ) : null
        )}
      </svg>
      <div className="adminAreaAxis">
        <span>{first}</span>
        <span>{last}</span>
      </div>
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
  if (items.length === 0) return <p className="cardHint">{empty}</p>;

  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const size = 120;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="adminDonutWrap">
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
          const circle = (
            <circle
              key={`${item.label}-${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>
                {item.label}: {item.value}
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
          {total}
        </text>
      </svg>
      <ul className="adminDonutLegend">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <span
              className="adminDonutSwatch"
              style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}
            />
            <span className="adminDonutLegendLabel">{item.label}</span>
            <span className="adminDonutLegendValue">{item.value}</span>
          </li>
        ))}
      </ul>
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

export function BarList({
  items,
  empty,
}: {
  items: { label: string; value: number }[];
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

export function HourChart({ hours }: { hours: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...hours.map((item) => item.count));
  return (
    <div className="adminHourChart" role="img" aria-label="Piekuren">
      {hours.map((item) => (
        <div key={item.hour} className="adminHourCol" title={`${item.hour}:00 · ${item.count}`}>
          <div
            className="adminHourBar"
            style={{ height: `${item.count > 0 ? Math.max(6, (item.count / max) * 100) : 0}%` }}
          />
          {item.hour % 3 === 0 && <span className="adminHourLabel">{item.hour}</span>}
        </div>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="adminStatCard">
      <p className="adminStatLabel">{label}</p>
      <p className="adminStatValue">{value}</p>
      {hint && <p className="adminStatHint">{hint}</p>}
    </div>
  );
}

import type { HealthState, OverallHealthState } from "../types";

const STATUS_LABELS: Record<HealthState, string> = {
  ok: "OK",
  degraded: "Verminderd",
  unavailable: "Onbeschikbaar",
  disabled: "Uitgeschakeld",
};

export function statusLabel(status: HealthState | OverallHealthState | string): string {
  return STATUS_LABELS[status as HealthState] ?? status;
}

export default function StatusBadge({
  status,
}: {
  status: HealthState | OverallHealthState | string;
}) {
  const tone = status in STATUS_LABELS ? status : "unknown";
  return <span className={`statusBadge statusBadge-${tone}`}>{statusLabel(status)}</span>;
}

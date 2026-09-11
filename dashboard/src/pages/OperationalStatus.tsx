import { useEffect, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { getAdminStatus } from "../api";
import { StatCard } from "../components/AdminCharts";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import StatusBadge, { statusLabel } from "../components/StatusBadge";
import type {
  AdminF1Flags,
  AdminStatusReport,
  DiscordUser,
  HealthState,
  StatusComponents,
  StatusSummary,
} from "../types";

const TIMEZONE = "Europe/Brussels";
const REFRESH_MS = 30_000;

const COMPONENT_KEYS = [
  "discord",
  "supabase",
  "dashboard",
  "f1ReminderJob",
  "timetablePanelJob",
] as const satisfies readonly (keyof StatusComponents)[];

const COMPONENT_LABELS: Record<(typeof COMPONENT_KEYS)[number], string> = {
  discord: "Discord",
  supabase: "Supabase",
  dashboard: "Dashboard",
  f1ReminderJob: "F1-herinneringen",
  timetablePanelJob: "Roosterpanelen",
};

const F1_FLAG_LABELS: { key: keyof AdminF1Flags; label: string }[] = [
  { key: "enabled", label: "Ingeschakeld" },
  { key: "channelConfigured", label: "Kanaal ingesteld" },
  { key: "roleConfigured", label: "Rol ingesteld" },
  { key: "testMode", label: "Testmodus" },
];

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const zoned = toZonedTime(date, TIMEZONE);
  const d = String(zoned.getDate()).padStart(2, "0");
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const hh = String(zoned.getHours()).padStart(2, "0");
  const mm = String(zoned.getMinutes()).padStart(2, "0");
  const ss = String(zoned.getSeconds()).padStart(2, "0");
  return `${d}/${m} ${hh}:${mm}:${ss}`;
}

function formatUptime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}u`);
  if (mins) parts.push(`${mins}m`);
  if (!days && (secs || parts.length === 0)) parts.push(`${secs}s`);
  return parts.join(" ");
}

function summaryFromComponents(components: StatusComponents | undefined): StatusSummary {
  const counts: StatusSummary = { ok: 0, degraded: 0, unavailable: 0, disabled: 0 };
  if (!components) return counts;
  for (const key of COMPONENT_KEYS) {
    const status = components[key]?.status as HealthState | undefined;
    if (status && status in counts) counts[status] += 1;
  }
  return counts;
}

export default function OperationalStatus({ user }: { user: DiscordUser }) {
  const [report, setReport] = useState<AdminStatusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(silent: boolean) {
      if (silent) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const payload = await getAdminStatus();
        if (cancelled) return;
        setReport(payload);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Laden mislukt");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load(false);
    const id = window.setInterval(() => void load(true), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [reloadKey]);

  const summary = report?.summary ?? summaryFromComponents(report?.components);
  const history = report?.history ?? [];
  const f1 = report?.admin?.f1;
  const runtime = report?.runtime;
  const overall = report?.status ?? "unavailable";

  return (
    <AppShell user={user}>
      <PageLayout
        title="Status"
        subtitle="Operationele status van Clippy"
        actions={
          <Button
            variant="secondary"
            size="small"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Vernieuwen…" : "Vernieuwen"}
          </Button>
        }
      >
        {loading && !report && <p className="timetableLoading">Laden…</p>}
        {error && <p className="errorMsg">{error}</p>}
        {report && (
          <>
            <section
              className={`statusHero statusHero-${overall}`}
              aria-live="polite"
            >
              <div>
                <p className="statusHeroLabel">Algemene status</p>
                <p className="statusHeroValue">{statusLabel(overall)}</p>
                <p className="statusHeroMeta">
                  Gecontroleerd {formatDateTime(report.checkedAt)} · automatische verversing
                  elke 30s
                </p>
              </div>
              <StatusBadge status={overall} />
            </section>

            <div className="adminStatGrid">
              <StatCard label="OK" value={summary.ok} />
              <StatCard label="Verminderd" value={summary.degraded} />
              <StatCard label="Onbeschikbaar" value={summary.unavailable} />
              <StatCard label="Uitgeschakeld" value={summary.disabled} />
            </div>

            <div className="statusStack">
              <PagePanel>
                <h2 className="cardTitle">Onderdelen</h2>
                <p className="cardHint">
                  Huidige health-probes. Latency wordt alleen voor Supabase getoond.
                </p>
                <div className="statusComponentGrid">
                  {COMPONENT_KEYS.map((key) => {
                    const component = report.components?.[key];
                    if (!component) return null;
                    return (
                      <article
                        key={key}
                        className={`statusComponentCard statusTone-${component.status}`}
                      >
                        <div className="statusComponentHead">
                          <h3 className="statusComponentTitle">{COMPONENT_LABELS[key]}</h3>
                          <StatusBadge status={component.status} />
                        </div>
                        <p className="statusComponentDetail">
                          {component.detail?.trim() ? component.detail : "Geen extra detail."}
                        </p>
                        {typeof component.latencyMs === "number" && (
                          <p className="statusComponentLatency">Latency {component.latencyMs} ms</p>
                        )}
                      </article>
                    );
                  })}
                </div>
                {COMPONENT_KEYS.every((key) => !report.components?.[key]) && (
                  <p className="cardHint">Geen onderdelen gerapporteerd.</p>
                )}
              </PagePanel>

              <div className="adminSplit">
                <PagePanel>
                  <h2 className="cardTitle">Runtime</h2>
                  <p className="cardHint">Procesmetadata zonder secrets of hostnamen.</p>
                  <dl className="statusMetaList">
                    <div>
                      <dt>Omgeving</dt>
                      <dd>{runtime?.nodeEnv || "—"}</dd>
                    </div>
                    <div>
                      <dt>Proces gestart</dt>
                      <dd>{formatDateTime(runtime?.processStartedAt)}</dd>
                    </div>
                    <div>
                      <dt>Uptime</dt>
                      <dd>{formatUptime(report.uptimeSeconds)}</dd>
                    </div>
                    <div>
                      <dt>Geschiedeniscapaciteit</dt>
                      <dd>
                        {typeof runtime?.historyCapacity === "number"
                          ? runtime.historyCapacity
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </PagePanel>
                <PagePanel>
                  <h2 className="cardTitle">F1-herinneringen</h2>
                  <p className="cardHint">Veilige configuratievlaggen, zonder kanaal- of rol-ID’s.</p>
                  {f1 ? (
                    <ul className="statusFlagList">
                      {F1_FLAG_LABELS.map((flag) => (
                        <li key={flag.key} className="statusFlagRow">
                          <span>{flag.label}</span>
                          <span
                            className={`adminShareBadge ${
                              f1[flag.key] ? "adminShareOn" : "adminShareOff"
                            }`}
                          >
                            {f1[flag.key] ? "Ja" : "Nee"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cardHint">Geen F1-vlaggen in dit antwoord.</p>
                  )}
                </PagePanel>
              </div>

              <PagePanel>
                <h2 className="cardTitle">Recente geschiedenis</h2>
                <p className="cardHint">
                  Eerdere snapshots, nieuwste eerst. Zonder runtime of admin-velden.
                </p>
                {history.length === 0 ? (
                  <p className="cardHint">Nog geen eerdere metingen.</p>
                ) : (
                  <ol className="statusHistory">
                    {history.map((entry, index) => {
                      const entrySummary =
                        entry.summary ?? summaryFromComponents(entry.components);
                      return (
                        <li key={`${entry.checkedAt}-${index}`} className="statusHistoryItem">
                          <StatusBadge status={entry.status} />
                          <div className="statusHistoryBody">
                            <p className="statusHistoryTime">{formatDateTime(entry.checkedAt)}</p>
                            <p className="adminMuted">
                              OK {entrySummary.ok} · verminderd {entrySummary.degraded} ·
                              onbeschikbaar {entrySummary.unavailable} · uitgeschakeld{" "}
                              {entrySummary.disabled}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </PagePanel>
            </div>
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

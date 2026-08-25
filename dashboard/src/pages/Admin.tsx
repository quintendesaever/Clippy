import { useEffect, useMemo, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { getAdminStats } from "../api";
import AppShell from "../components/AppShell";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import type {
  AdminRangePreset,
  AdminStatsResponse,
  AdminUserRow,
  DiscordUser,
} from "../types";

const RANGE_OPTIONS: { value: AdminRangePreset; label: string }[] = [
  { value: "today", label: "Vandaag" },
  { value: "7d", label: "7 dagen" },
  { value: "30d", label: "30 dagen" },
  { value: "all", label: "Alles" },
];

const PATH_LABELS: Record<string, string> = {
  "/": "Login",
  "/timetable": "Rooster",
  "/my-timetable": "Mijn rooster",
  "/settings": "Instellingen",
  "/admin": "Beheer",
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobiel",
  tablet: "Tablet",
  unknown: "Onbekend",
};

function pathLabel(path: string): string {
  return PATH_LABELS[path] ?? path;
}

function formatDateTime(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const zoned = toZonedTime(new Date(iso), timezone);
  const d = String(zoned.getDate()).padStart(2, "0");
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const hh = String(zoned.getHours()).padStart(2, "0");
  const mm = String(zoned.getMinutes()).padStart(2, "0");
  return `${d}/${m} ${hh}:${mm}`;
}

function BarList({
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
      {items.map((item) => (
        <div key={item.label} className="adminBarRow">
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

function HourChart({ hours }: { hours: { hour: number; count: number }[] }) {
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

export default function Admin({ user }: { user: DiscordUser }) {
  const [range, setRange] = useState<AdminRangePreset>("7d");
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "activity" | "visit" | "share">("name");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAdminStats(range)
      .then((statsPayload) => {
        if (cancelled) return;
        setStats(statsPayload);
        setUsers(statsPayload.members);
        setTimezone(statsPayload.timezone);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Laden mislukt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? users.filter((row) =>
          [row.displayName, row.username, row.initials, row.userId]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(q))
        )
      : [...users];
    rows.sort((a, b) => {
      if (sortKey === "activity") return b.activityCount - a.activityCount;
      if (sortKey === "visit") {
        return (b.lastDashboardAt ?? "").localeCompare(a.lastDashboardAt ?? "");
      }
      if (sortKey === "share") {
        return Number(b.shareLocation) - Number(a.shareLocation);
      }
      return a.displayName.localeCompare(b.displayName, "nl");
    });
    return rows;
  }, [users, query, sortKey]);

  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of users) map.set(row.userId, row.displayName);
    return map;
  }, [users]);

  return (
    <AppShell user={user}>
      <PageLayout
        title="Beheer"
        subtitle="Dashboardstatistieken en leden"
        actions={
          <div className="topBarTabs" role="radiogroup" aria-label="Periode">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={range === option.value}
                className={`topBarTab ${range === option.value ? "topBarTabActive" : ""}`}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {loading && <p className="timetableLoading">Laden…</p>}
        {error && <p className="errorMsg">{error}</p>}
        {!loading && stats && (
          <>
            <div className="adminStatGrid">
              <StatCard label="Paginaweergaven" value={stats.web.pageViews} />
              <StatCard
                label="Unieke gebruikers"
                value={stats.web.uniqueUsers}
                hint="Aangemelde Discord-gebruikers"
              />
              <StatCard
                label="Unieke sessies"
                value={stats.web.uniqueSessions}
                hint="Onderscheiden analytics-sessies"
              />
              <StatCard label="Bezoeken vandaag" value={stats.web.visitsToday} />
              <StatCard label="Leden" value={stats.users.total} />
              <StatCard label="Actief in periode" value={stats.users.active} />
              <StatCard label="Activiteiten in periode" value={stats.activities.inRange} />
              <StatCard
                label="Locatie delen aan"
                value={`${stats.users.shareLocationEnabled}/${stats.users.total}`}
              />
            </div>

            <div className="adminSplit">
              <PagePanel>
                <h2 className="cardTitle">Paginaweergaven in de tijd</h2>
                <p className="cardHint">Per dag in de guild-tijdzone ({stats.timezone}).</p>
                <BarList
                  items={stats.web.viewsOverTime.map((row) => ({
                    label: row.day,
                    value: row.count,
                  }))}
                  empty="Nog geen paginaweergaven in deze periode."
                />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Piekuren</h2>
                <p className="cardHint">Wanneer het dashboard bezocht wordt.</p>
                <HourChart hours={stats.web.peakHours} />
              </PagePanel>
            </div>

            <div className="adminSplit">
              <PagePanel>
                <h2 className="cardTitle">Meest bezochte pagina’s</h2>
                <BarList
                  items={stats.web.mostVisitedPages.map((row) => ({
                    label: pathLabel(row.path),
                    value: row.count,
                  }))}
                  empty="Nog geen paginaweergaven."
                />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Apparaten en browsers</h2>
                <BarList
                  items={stats.web.byDevice.map((row) => ({
                    label: DEVICE_LABELS[row.deviceType] ?? row.deviceType,
                    value: row.count,
                  }))}
                  empty="Nog geen apparaatgegevens."
                />
                <div className="adminSpacer" />
                <BarList
                  items={stats.web.byBrowser.map((row) => ({
                    label: row.browserFamily,
                    value: row.count,
                  }))}
                  empty="Nog geen browsergegevens."
                />
              </PagePanel>
            </div>

            <div className="adminSplit">
              <PagePanel>
                <h2 className="cardTitle">Bezoekers per land</h2>
                <BarList
                  items={stats.web.byCountry.map((row) => ({
                    label: row.country,
                    value: row.count,
                  }))}
                  empty="Nog geen locatiegegevens. Cloudflare visitor headers vullen land/stad."
                />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Stad / regio</h2>
                <BarList
                  items={stats.web.byCity.map((row) => ({
                    label: [row.city, row.region, row.country].filter(Boolean).join(", "),
                    value: row.count,
                  }))}
                  empty="Nog geen stadsgegevens."
                />
              </PagePanel>
            </div>

            <PagePanel>
              <h2 className="cardTitle">Activiteiten</h2>
              <p className="cardHint">
                Totaal {stats.activities.total} · gemiddeld {stats.activities.averagePerUser} per
                lid · {stats.users.newDashboardUsers} nieuwe dashboardgebruikers in deze periode
                (eerste geregistreerde bezoek).
              </p>
              <BarList
                items={stats.activities.perDay.map((row) => ({ label: row.day, value: row.count }))}
                empty="Geen activiteiten in deze periode."
              />
              {stats.users.mostActive.length > 0 && (
                <>
                  <h3 className="adminSubhead">Meest actieve leden</h3>
                  <BarList
                    items={stats.users.mostActive.map((row) => ({
                      label: nameByUser.get(row.userId) ?? row.userId,
                      value: row.activityCount,
                    }))}
                    empty=""
                  />
                </>
              )}
            </PagePanel>

            <PagePanel>
              <h2 className="cardTitle">Recente dashboardactiviteit</h2>
              <p className="cardHint">
                Wie het dashboard bezocht, wanneer, welke pagina, en de laatst gedetecteerde
                benaderende locatie (geen GPS).
              </p>
              {stats.web.recentVisits.length === 0 ? (
                <p className="cardHint">Nog geen bezoeken in deze periode.</p>
              ) : (
                <div className="adminTableWrap">
                  <table className="adminTable">
                    <thead>
                      <tr>
                        <th>Gebruiker</th>
                        <th>Tijdstip</th>
                        <th>Pagina</th>
                        <th>Laatst gedetecteerde locatie</th>
                        <th>Apparaat</th>
                        <th>Browser</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.web.recentVisits.map((visit, index) => (
                        <tr key={`${visit.occurredAt}-${visit.userId ?? "anon"}-${visit.path}-${index}`}>
                          <td>{visit.displayName ?? visit.userId ?? "Niet aangemeld"}</td>
                          <td>{formatDateTime(visit.occurredAt, timezone)}</td>
                          <td>{pathLabel(visit.path)}</td>
                          <td>{visit.locationLabel ?? "—"}</td>
                          <td>
                            {visit.deviceType
                              ? (DEVICE_LABELS[visit.deviceType] ?? visit.deviceType)
                              : "—"}
                          </td>
                          <td>{visit.browserFamily ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PagePanel>

            <PagePanel>
              <h2 className="cardTitle">Leden</h2>
              <p className="cardHint">
                Locatie delen is de expliciete voorkeur. De getoonde locatie is de laatst
                gedetecteerde dashboardlocatie; beheerders zien die ook als delen uitstaat.
              </p>
              <div className="adminUserToolbar">
                <input
                  className="formInput"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Zoek op naam…"
                  aria-label="Leden zoeken"
                />
                <label className="adminSort">
                  Sorteren
                  <select
                    className="formInput formSelect"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                  >
                    <option value="name">Naam</option>
                    <option value="activity">Activiteiten</option>
                    <option value="visit">Laatste bezoek</option>
                    <option value="share">Locatie delen</option>
                  </select>
                </label>
              </div>
              <div className="adminTableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>Lid</th>
                      <th>Activiteiten</th>
                      <th>Laatste activiteit</th>
                      <th>Laatste dashboardbezoek</th>
                      <th>Laatst gedetecteerde locatie</th>
                      <th>Locatie delen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((row) => (
                      <tr key={row.userId}>
                        <td>
                          <div className="adminUserCell">
                            <strong>{row.displayName}</strong>
                            {row.username && (
                              <span className="adminMuted">@{row.username}</span>
                            )}
                          </div>
                        </td>
                        <td>{row.activityCount}</td>
                        <td>{formatDateTime(row.lastActivityAt, timezone)}</td>
                        <td>{formatDateTime(row.lastDashboardAt, timezone)}</td>
                        <td>{row.lastDetectedLocation ?? "—"}</td>
                        <td>
                          <span
                            className={`adminShareBadge ${
                              row.shareLocation ? "adminShareOn" : "adminShareOff"
                            }`}
                          >
                            {row.shareLocation ? "Ingeschakeld" : "Uitgeschakeld"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PagePanel>
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

function StatCard({
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

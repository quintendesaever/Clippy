import { useEffect, useMemo, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { payloadHasUnresolvedNames } from "@shared/memberName";
import { getAdminStats } from "../api";
import {
  AreaChart,
  BarList,
  DayHeatmap,
  DonutChart,
  HourChart,
  StatCard,
} from "../components/AdminCharts";
import AdminSection from "../components/AdminSection";
import AppShell from "../components/AppShell";
import MemberFilter from "../components/MemberFilter";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import {
  statsUserFilterKey,
  toggleMemberId,
  useDebouncedValue,
} from "../lib/adminMemberFilter";
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
  "/admin/discord": "Discord",
  "/admin/status": "Status",
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobiel",
  tablet: "Tablet",
  unknown: "Onbekend",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  "activity.create": "Activiteit aangemaakt",
  "activity.update": "Activiteit gewijzigd",
  "activity.delete": "Activiteit verwijderd",
  "activity.join": "Deelgenomen",
  "activity.leave": "Verlaten",
  "calendar.save": "Kalender opgeslagen",
  "calendar.delete": "Kalender verwijderd",
};

function pathLabel(path: string): string {
  return PATH_LABELS[path] ?? path;
}

function actionTypeLabel(type: string): string {
  return ACTION_TYPE_LABELS[type] ?? type;
}

function referrerLabel(referrer: string): string {
  try {
    const url = new URL(referrer);
    return url.host + (url.pathname !== "/" ? url.pathname : "");
  } catch {
    return referrer;
  }
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

export default function Admin({ user }: { user: DiscordUser }) {
  const [range, setRange] = useState<AdminRangePreset>("7d");
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "activity" | "visit" | "share">("name");

  const memberIds = users.map((row) => row.userId);
  const filterKey = statsUserFilterKey(selected, memberIds);
  const debouncedFilterKey = useDebouncedValue(filterKey, 250);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const userIds = debouncedFilterKey === "all" ? undefined : debouncedFilterKey.split(",");
    const load = async (retried: boolean): Promise<AdminStatsResponse> => {
      const statsPayload = await getAdminStats(range, userIds);
      const names = [
        ...statsPayload.members.map((row) => row.displayName),
        ...statsPayload.web.recentVisits.map((row) => row.displayName),
        ...statsPayload.dashboardActions.recent.map((row) => row.displayName),
      ];
      const ids = [
        ...statsPayload.members.map((row) => row.userId),
        ...statsPayload.web.recentVisits.map((row) => row.userId),
        ...statsPayload.dashboardActions.recent.map((row) => row.userId),
      ];
      if (!retried && payloadHasUnresolvedNames(names, ids)) {
        return load(true);
      }
      return statsPayload;
    };
    load(false)
      .then((statsPayload) => {
        if (cancelled) return;
        setStats(statsPayload);
        setUsers(statsPayload.members);
        setSelected((prev) =>
          prev.size === 0 ? new Set(statsPayload.members.map((row) => row.userId)) : prev
        );
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
  }, [range, debouncedFilterKey]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chipActive =
      memberIds.length > 0 && selected.size > 0 && !memberIds.every((id) => selected.has(id));
    const source = chipActive ? users.filter((row) => selected.has(row.userId)) : [...users];
    const rows = q
      ? source.filter((row) =>
          [row.displayName, row.username, row.initials, row.userId]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(q))
        )
      : source;
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
  }, [users, query, sortKey, selected, memberIds]);

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
        {users.length > 0 && (
          <div className="adminMemberFilter">
            <MemberFilter
              members={users.map((row) => ({
                userId: row.userId,
                label: row.initials ?? row.displayName,
                avatarHash: row.avatarHash,
              }))}
              selected={selected}
              onToggle={(userId) => setSelected((prev) => toggleMemberId(prev, userId))}
            />
          </div>
        )}
        {loading && <p className="timetableLoading">Laden…</p>}
        {error && <p className="errorMsg">{error}</p>}
        {!loading && stats && (
          <>
            <AdminSection title="Overzicht" hint="Belangrijkste dashboardcijfers voor de gekozen periode.">
              <div className="adminStatGrid adminStatGridPrimary">
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
              </div>
              <div className="adminStatGrid adminStatGridSecondary">
                <StatCard compact label="Leden" value={stats.users.total} />
                <StatCard compact label="Actief in periode" value={stats.users.active} />
                <StatCard compact label="Activiteiten" value={stats.activities.inRange} />
                <StatCard
                  compact
                  label="Nieuwe gebruikers"
                  value={stats.users.newDashboardUsers}
                  hint="Eerste geregistreerde bezoek in deze periode"
                />
                <StatCard
                  compact
                  label="Leslocaties delen"
                  value={`${stats.users.shareLocationEnabled}/${stats.users.total}`}
                />
                <StatCard
                  compact
                  label="Kalender gekoppeld"
                  value={`${stats.calendars?.withIcs ?? 0}/${stats.users.total}`}
                  hint="Leden met een niet-lege kalender-URL"
                />
                <StatCard
                  compact
                  label="Zonder kalender"
                  value={stats.calendars?.withoutIcs ?? 0}
                />
                <StatCard compact label="Dashboardacties" value={stats.dashboardActions.total} />
              </div>
            </AdminSection>

            <AdminSection
              title="Webverkeer"
              hint={`Trends en piekmomenten in ${stats.timezone}.`}
            >
              <PagePanel className="adminPanelFlush">
                <h3 className="adminSubhead">Paginaweergaven in de tijd</h3>
                <AreaChart
                  items={stats.web.viewsOverTime.map((row) => ({
                    label: row.day,
                    value: row.count,
                  }))}
                  empty="Nog geen paginaweergaven in deze periode."
                  ariaLabel="Paginaweergaven per dag"
                />
              </PagePanel>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Piekuren</h3>
                  <p className="cardHint">Wanneer het dashboard bezocht wordt.</p>
                  <HourChart hours={stats.web.peakHours} />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Piekdagen</h3>
                  <p className="cardHint">Weekdagen met de meeste bezoeken.</p>
                  <DayHeatmap
                    days={stats.web.peakDays}
                    empty="Nog geen paginaweergaven in deze periode."
                  />
                </PagePanel>
              </div>
            </AdminSection>

            <AdminSection title="Bezoekers" hint="Waar vandaan en waarmee mensen het dashboard openen.">
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Apparaten</h3>
                  <DonutChart
                    items={stats.web.byDevice.map((row) => ({
                      label: DEVICE_LABELS[row.deviceType] ?? row.deviceType,
                      value: row.count,
                    }))}
                    empty="Nog geen apparaatgegevens."
                    ariaLabel="Apparaten"
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Browsers</h3>
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
                  <h3 className="adminSubhead">Meest bezochte pagina’s</h3>
                  <BarList
                    items={stats.web.mostVisitedPages.map((row) => ({
                      label: pathLabel(row.path),
                      value: row.count,
                    }))}
                    empty="Nog geen paginaweergaven."
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Verwijzers</h3>
                  <p className="cardHint">Externe sites; interne navigatie telt niet mee.</p>
                  <BarList
                    items={(stats.web.referrers ?? []).map((row) => ({
                      label: referrerLabel(row.referrer),
                      value: row.count,
                    }))}
                    empty="Nog geen externe verwijzers in deze periode."
                  />
                </PagePanel>
              </div>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Land</h3>
                  <BarList
                    items={stats.web.byCountry.map((row) => ({
                      label: row.country,
                      value: row.count,
                    }))}
                    empty="Nog geen locatiegegevens. Cloudflare visitor headers vullen land/stad."
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Stad / regio</h3>
                  <BarList
                    items={stats.web.byCity.map((row) => ({
                      label: [row.city, row.region, row.country].filter(Boolean).join(", "),
                      value: row.count,
                    }))}
                    empty="Nog geen stadsgegevens."
                  />
                </PagePanel>
              </div>
            </AdminSection>

            <AdminSection
              title="Activiteiten"
              hint={`Totaal ${stats.activities.total} · gemiddeld ${stats.activities.averagePerUser} per lid.`}
            >
              <PagePanel className="adminPanelFlush">
                <h3 className="adminSubhead">Activiteiten per dag</h3>
                <AreaChart
                  items={stats.activities.perDay.map((row) => ({
                    label: row.day,
                    value: row.count,
                  }))}
                  empty="Geen activiteiten in deze periode."
                  ariaLabel="Activiteiten per dag"
                />
              </PagePanel>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Meest actieve leden</h3>
                  <BarList
                    items={stats.users.mostActive.map((row) => ({
                      label: nameByUser.get(row.userId) ?? row.userId,
                      value: row.activityCount,
                    }))}
                    empty="Nog geen deelnames in deze periode."
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Aanmakers</h3>
                  <BarList
                    items={stats.activities.byCreator.map((row) => ({
                      label: nameByUser.get(row.userId) ?? row.userId,
                      value: row.count,
                    }))}
                    empty="Nog geen activiteiten aangemaakt in deze periode."
                  />
                </PagePanel>
              </div>
            </AdminSection>

            <AdminSection
              title="Dashboardacties"
              hint="Mutaties in het dashboard. Geen berichtinhoud, kalender-URL’s of tokens."
            >
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Acties in de tijd</h3>
                  <AreaChart
                    items={stats.dashboardActions.overTime.map((row) => ({
                      label: row.day,
                      value: row.count,
                    }))}
                    empty="Nog geen dashboardacties in deze periode."
                    ariaLabel="Dashboardacties per dag"
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Per type</h3>
                  <BarList
                    items={stats.dashboardActions.byType.map((row) => ({
                      label: actionTypeLabel(row.key),
                      value: row.count,
                    }))}
                    empty="Nog geen dashboardacties in deze periode."
                  />
                </PagePanel>
              </div>
              <PagePanel>
                <h3 className="adminSubhead">Meest actieve gebruikers</h3>
                <BarList
                  items={stats.dashboardActions.topUsers.map((row) => ({
                    label: row.displayName,
                    value: row.count,
                  }))}
                  empty="Nog geen dashboardacties in deze periode."
                />
                <h3 className="adminSubhead">Recente dashboardacties</h3>
                {stats.dashboardActions.recent.length === 0 ? (
                  <p className="cardHint">Nog geen dashboardacties in deze periode.</p>
                ) : (
                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th>Gebruiker</th>
                          <th>Tijdstip</th>
                          <th>Type</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.dashboardActions.recent.map((row, index) => (
                          <tr
                            key={`${row.occurredAt}-${row.userId ?? "anon"}-${row.eventType}-${index}`}
                          >
                            <td>{row.displayName}</td>
                            <td>{formatDateTime(row.occurredAt, timezone)}</td>
                            <td>{actionTypeLabel(row.eventType)}</td>
                            <td>{row.detail ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PagePanel>
            </AdminSection>

            <AdminSection
              title="Recente bezoeken"
              hint="Wie het dashboard bezocht, wanneer, welke pagina, en de laatst gedetecteerde benaderende locatie (geen GPS)."
            >
              <PagePanel>
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
                          <th>Bezoekerslocatie</th>
                          <th>Apparaat</th>
                          <th>Browser</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.web.recentVisits.map((visit, index) => (
                          <tr
                            key={`${visit.occurredAt}-${visit.userId ?? "anon"}-${visit.path}-${index}`}
                          >
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
            </AdminSection>

            <AdminSection
              title="Leden"
              hint="Bezoekerslocatie is Cloudflare-data (alleen beheerders). Leslocaties delen is de roostervoorkeur."
            >
              <PagePanel>
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
                      <option value="share">Leslocaties delen</option>
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
                        <th>Bezoekerslocatie</th>
                        <th>Leslocaties delen</th>
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
            </AdminSection>
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

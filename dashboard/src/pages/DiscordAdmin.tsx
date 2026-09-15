import { useEffect, useMemo, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { payloadHasUnresolvedNames } from "@shared/memberName";
import { getDiscordAdminStats } from "../api";
import {
  AreaChart,
  BarList,
  DonutChart,
  HourChart,
  StatCard,
} from "../components/AdminCharts";
import AdminSection from "../components/AdminSection";
import AdminSubnav from "../components/AdminSubnav";
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
  AdminFilterMember,
  AdminRangePreset,
  DiscordAdminRecentActivity,
  DiscordAdminStatsResponse,
  DiscordAdminUserRow,
  DiscordUser,
} from "../types";

const RANGE_OPTIONS: { value: AdminRangePreset; label: string }[] = [
  { value: "today", label: "Vandaag" },
  { value: "7d", label: "7 dagen" },
  { value: "30d", label: "30 dagen" },
  { value: "all", label: "Alles" },
];

function formatDateTime(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const zoned = toZonedTime(new Date(iso), timezone);
  const d = String(zoned.getDate()).padStart(2, "0");
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const hh = String(zoned.getHours()).padStart(2, "0");
  const mm = String(zoned.getMinutes()).padStart(2, "0");
  return `${d}/${m} ${hh}:${mm}`;
}

function formatDuration(seconds: number | null, open = false): string {
  if (open) return "Open";
  if (seconds == null || seconds <= 0) return "—";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return "<1 min";
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}u`;
  return `${hours}u ${mins}m`;
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

const COMMAND_LABELS: Record<string, string> = {
  timetable: "/timetable",
  ping: "/ping",
  "f1-reminder": "/f1-reminder",
  stats: "/stats",
  "backfill-stats": "/backfill-stats",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  "timetable.day": "Roosterdag",
  "f1.stats": "F1-statistieken",
};

function botEventTypeLabel(type: string): string {
  if (type.startsWith("command.")) {
    const name = type.slice("command.".length);
    return COMMAND_LABELS[name] ?? `/${name}`;
  }
  return ACTION_TYPE_LABELS[type] ?? type;
}

function formatDayKey(dayKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return dayKey;
  return `${match[3]}/${match[2]}`;
}

function botEventDetail(type: string, detail: string | null): string {
  if (!detail) return "—";
  if (type === "timetable.day") return formatDayKey(detail);
  return detail;
}

function recentTypeLabel(row: DiscordAdminRecentActivity): string {
  if (row.type === "message") return "Bericht";
  if (row.type === "voice") return "Spraak";
  return botEventTypeLabel(row.eventType ?? "bot");
}

function recentChannelOrDetail(row: DiscordAdminRecentActivity): string {
  if (row.type === "bot") return botEventDetail(row.eventType ?? "", row.detail ?? null);
  return row.channelName || "—";
}

export default function DiscordAdmin({ user }: { user: DiscordUser }) {
  const [range, setRange] = useState<AdminRangePreset>("7d");
  const [stats, setStats] = useState<DiscordAdminStatsResponse | null>(null);
  const [chipMembers, setChipMembers] = useState<AdminFilterMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "messages" | "voice" | "last">("messages");

  const memberIds = chipMembers.map((row) => row.userId);
  const filterKey = statsUserFilterKey(selected, memberIds);
  const debouncedFilterKey = useDebouncedValue(filterKey, 250);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const userIds = debouncedFilterKey === "all" ? undefined : debouncedFilterKey.split(",");
    const load = async (retried: boolean): Promise<DiscordAdminStatsResponse> => {
      const payload = await getDiscordAdminStats(range, userIds);
      const names = [
        ...payload.members.map((row) => row.displayName),
        ...payload.users.map((row) => row.displayName),
        ...payload.recent.map((row) => row.displayName),
        ...payload.topUsersByMessages.map((row) => row.displayName),
        ...payload.topUsersByVoiceSeconds.map((row) => row.displayName),
      ];
      const ids = [
        ...payload.members.map((row) => row.userId),
        ...payload.users.map((row) => row.userId),
        ...payload.recent.map((row) => row.userId),
        ...payload.topUsersByMessages.map((row) => row.userId),
        ...payload.topUsersByVoiceSeconds.map((row) => row.userId),
      ];
      if (!retried && payloadHasUnresolvedNames(names, ids)) {
        return load(true);
      }
      return payload;
    };
    load(false)
      .then((payload) => {
        if (cancelled) return;
        setStats(payload);
        setChipMembers(payload.members);
        setSelected((prev) =>
          prev.size === 0 ? new Set(payload.members.map((row) => row.userId)) : prev
        );
        setTimezone(payload.timezone);
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
    const users: DiscordAdminUserRow[] = stats?.users ?? [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? users.filter((row) =>
          [row.displayName, row.username, row.userId]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(q))
        )
      : [...users];
    rows.sort((a, b) => {
      if (sortKey === "messages") return b.messageCount - a.messageCount;
      if (sortKey === "voice") return b.voiceSeconds - a.voiceSeconds;
      if (sortKey === "last") {
        return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
      }
      return a.displayName.localeCompare(b.displayName, "nl");
    });
    return rows;
  }, [stats, query, sortKey]);

  const voiceHint =
    "Spraaktijd telt alleen afgesloten sessies tot 24 uur. Open of vastgelopen sessies zitten niet in de duur.";

  const botCommandItems = (stats?.botUsage.commands ?? []).map((row) => ({
    label: COMMAND_LABELS[row.key] ?? `/${row.key}`,
    value: row.count,
  }));

  return (
    <AppShell user={user}>
      <PageLayout
        title="Discord"
        subtitle="Serveractiviteit en botgebruik"
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
        <AdminSubnav />
        {chipMembers.length > 0 && (
          <div className="adminMemberFilter">
            <MemberFilter
              members={chipMembers.map((row) => ({
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
            <AdminSection
              title="Overzicht"
              hint="Belangrijkste Discordcijfers voor de gekozen periode."
            >
              <div className="adminStatGrid adminStatGridPrimary">
                <StatCard label="Berichten" value={stats.summary.messagesInRange} />
                <StatCard label="Unieke auteurs" value={stats.summary.uniqueAuthors} />
                <StatCard
                  label="Spraaktijd"
                  value={formatDuration(stats.summary.voiceSecondsClosed)}
                  hint={voiceHint}
                />
                <StatCard label="Actief in periode" value={stats.summary.activeUsers} />
              </div>
              <div className="adminStatGrid adminStatGridSecondary">
                <StatCard compact label="Berichten totaal" value={stats.summary.messagesTotal} />
                <StatCard compact label="Bijlagen" value={stats.summary.attachmentsInRange} />
                <StatCard
                  compact
                  label="Antwoorden"
                  value={stats.summary.replyCount}
                  hint={`Antwoordpercentage ${formatPercent(stats.summary.replyRate)}`}
                />
                <StatCard
                  compact
                  label="Reacties"
                  value={stats.summary.reactionsInRange}
                  hint="Totaal aantal emoji-reacties"
                />
                <StatCard
                  compact
                  label="Verwijderd"
                  value={stats.summary.deletedInRange}
                  hint="Tellen niet mee in het berichttotaal"
                />
                <StatCard
                  compact
                  label="Gem. woorden"
                  value={stats.summary.avgWordCount}
                />
                <StatCard compact label="Spraaksessies" value={stats.summary.voiceSessionsInRange} />
                <StatCard
                  compact
                  label="Gem. sessieduur"
                  value={formatDuration(stats.summary.voiceAverageSeconds)}
                  hint={
                    stats.summary.voiceOpenInRange > 0
                      ? `${stats.summary.voiceOpenInRange} open sessie(s)`
                      : voiceHint
                  }
                />
                <StatCard
                  compact
                  label="Ledental"
                  value={stats.summary.memberCount ?? "—"}
                  hint={
                    stats.summary.memberCountRecordedAt
                      ? `Snapshot ${formatDateTime(stats.summary.memberCountRecordedAt, timezone)}`
                      : "Op basis van bekende leden"
                  }
                />
                <StatCard
                  compact
                  label="Vastgelopen spraak"
                  value={stats.summary.voiceUnreliableClosed}
                  hint="Sessies >24u, niet meegeteld in spraaktijd"
                />
                <StatCard compact label="Botacties" value={stats.botUsage.total} />
                <StatCard
                  compact
                  label="Spraaksessies totaal"
                  value={stats.summary.voiceSessionsTotal}
                />
              </div>
            </AdminSection>

            <AdminSection
              title="Berichten"
              hint={
                range === "all"
                  ? `Trends per maand in ${stats.timezone}.`
                  : `Trends per dag in ${stats.timezone}.`
              }
            >
              <PagePanel className="adminPanelFlush">
                <h3 className="adminSubhead">Berichten in de tijd</h3>
                <AreaChart
                  items={stats.messagesOverTime.map((row) => ({
                    label: row.key,
                    value: row.count,
                  }))}
                  empty="Nog geen Discord-berichten in deze periode."
                  ariaLabel="Berichten per periode"
                />
              </PagePanel>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Piekuren</h3>
                  <p className="cardHint">Wanneer er berichten verstuurd worden.</p>
                  <HourChart hours={stats.peakHours} />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Meest gebruikte emoji</h3>
                  <p className="cardHint">Reacties op berichten in deze periode.</p>
                  <BarList
                    items={stats.topEmojis.map((row) => ({
                      label: row.key,
                      value: row.count,
                    }))}
                    empty="Nog geen reacties in deze periode."
                  />
                </PagePanel>
              </div>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Meest actieve gebruikers</h3>
                  <BarList
                    items={stats.topUsersByMessages.map((row) => ({
                      label: row.displayName,
                      value: row.count,
                    }))}
                    empty="Nog geen berichten in deze periode."
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Berichten per kanaal</h3>
                  <BarList
                    items={stats.topChannelsByMessages.map((row) => ({
                      label: row.name,
                      value: row.count,
                    }))}
                    empty="Nog geen kanaalactiviteit in deze periode."
                  />
                </PagePanel>
              </div>
            </AdminSection>

            <AdminSection title="Spraak" hint={voiceHint}>
              <PagePanel className="adminPanelFlush">
                <h3 className="adminSubhead">Spraakminuten in de tijd</h3>
                <AreaChart
                  items={stats.voiceMinutesOverTime.map((row) => ({
                    label: row.key,
                    value: row.count,
                  }))}
                  empty="Nog geen afgesloten spraaksessies in deze periode."
                  ariaLabel="Spraakminuten per periode"
                />
              </PagePanel>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Spraakpiekuren</h3>
                  <p className="cardHint">Wanneer spraaksessies starten.</p>
                  <HourChart hours={stats.voicePeakHours} />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Spraak per kanaal</h3>
                  <p className="cardHint">Minuten in afgesloten sessies.</p>
                  <BarList
                    items={stats.topChannelsByVoiceSeconds.map((row) => ({
                      label: row.name,
                      value: Math.round(row.seconds / 60),
                    }))}
                    empty="Nog geen spraakactiviteit in deze periode."
                  />
                </PagePanel>
              </div>
              <PagePanel>
                <h3 className="adminSubhead">Meest actieve spraakgebruikers</h3>
                <BarList
                  items={stats.topUsersByVoiceSeconds.map((row) => ({
                    label: row.displayName,
                    value: Math.round(row.seconds / 60),
                  }))}
                  empty="Nog geen afgesloten spraaksessies in deze periode."
                />
              </PagePanel>
            </AdminSection>

            <AdminSection
              title="Ledental"
              hint="Snapshots worden bij het opstarten van de bot genomen, dus de reeks is spaarzaam."
            >
              <PagePanel className="adminPanelFlush">
                <AreaChart
                  items={stats.memberCountOverTime.map((row) => ({
                    label: row.key,
                    value: row.count,
                  }))}
                  empty="Nog geen ledental-snapshots in deze periode."
                  ariaLabel="Ledental in de tijd"
                />
              </PagePanel>
            </AdminSection>

            <AdminSection
              title="Botgebruik"
              hint="Slash commands en knoppen in Discord. Berichtinhoud wordt niet bewaard."
            >
              <div className="adminStatGrid adminStatGridSecondary">
                <StatCard compact label="Botacties" value={stats.botUsage.total} />
                <StatCard compact label="Roosterdagen" value={stats.botUsage.timetableDayClicks} />
                <StatCard compact label="F1-statistieken" value={stats.botUsage.f1StatsClicks} />
              </div>
              <div className="adminSplit">
                <PagePanel>
                  <h3 className="adminSubhead">Commands</h3>
                  <DonutChart
                    items={botCommandItems}
                    empty="Nog geen slash commands in deze periode."
                    ariaLabel="Commands"
                  />
                  <h3 className="adminSubhead">Knoppen</h3>
                  <BarList
                    items={stats.botUsage.actions.map((row) => ({
                      label: ACTION_TYPE_LABELS[row.key] ?? row.key,
                      value: row.count,
                    }))}
                    empty="Nog geen knopacties in deze periode."
                  />
                </PagePanel>
                <PagePanel>
                  <h3 className="adminSubhead">Botacties in de tijd</h3>
                  <AreaChart
                    items={stats.botUsage.overTime.map((row) => ({
                      label: row.key,
                      value: row.count,
                    }))}
                    empty="Nog geen botacties in deze periode."
                    ariaLabel="Botacties per periode"
                  />
                </PagePanel>
              </div>
            </AdminSection>

            <AdminSection
              title="Recente activiteit"
              hint="Metadata van recente berichten, spraaksessies en botacties. Berichtinhoud wordt niet getoond."
            >
              <PagePanel>
                {stats.recent.length === 0 ? (
                  <p className="cardHint">Nog geen Discordactiviteit in deze periode.</p>
                ) : (
                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th>Gebruiker</th>
                          <th>Tijdstip</th>
                          <th>Type</th>
                          <th>Kanaal / detail</th>
                          <th>Duur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recent.map((row, index) => (
                          <tr key={`${row.type}-${row.occurredAt}-${row.userId}-${index}`}>
                            <td>{row.displayName}</td>
                            <td>{formatDateTime(row.occurredAt, timezone)}</td>
                            <td>{recentTypeLabel(row)}</td>
                            <td>{recentChannelOrDetail(row)}</td>
                            <td>
                              {row.type === "voice"
                                ? formatDuration(row.durationSeconds, row.open)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PagePanel>
            </AdminSection>

            <AdminSection
              title="Gebruikers"
              hint="Leden met Discordactiviteit in de geselecteerde periode."
            >
              <PagePanel>
                <div className="adminUserToolbar">
                  <input
                    className="formInput"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Zoek op naam…"
                    aria-label="Gebruikers zoeken"
                  />
                  <label className="adminSort">
                    Sorteren
                    <select
                      className="formInput formSelect"
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                    >
                      <option value="messages">Berichten</option>
                      <option value="voice">Spraaktijd</option>
                      <option value="last">Laatste activiteit</option>
                      <option value="name">Naam</option>
                    </select>
                  </label>
                </div>
                {filteredUsers.length === 0 ? (
                  <p className="cardHint">Geen gebruikers met Discordactiviteit in deze periode.</p>
                ) : (
                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th>Lid</th>
                          <th>Berichten</th>
                          <th>Spraaksessies</th>
                          <th>Spraaktijd</th>
                          <th>Laatste activiteit</th>
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
                            <td>{row.messageCount}</td>
                            <td>{row.voiceSessionCount}</td>
                            <td>{formatDuration(row.voiceSeconds)}</td>
                            <td>{formatDateTime(row.lastActivityAt, timezone)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PagePanel>
            </AdminSection>
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

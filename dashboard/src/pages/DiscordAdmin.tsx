import { useEffect, useMemo, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { getDiscordAdminStats } from "../api";
import { BarList, HourChart, StatCard } from "../components/AdminCharts";
import AppShell from "../components/AppShell";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import type {
  AdminRangePreset,
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

export default function DiscordAdmin({ user }: { user: DiscordUser }) {
  const [range, setRange] = useState<AdminRangePreset>("7d");
  const [stats, setStats] = useState<DiscordAdminStatsResponse | null>(null);
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "messages" | "voice" | "last">("messages");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDiscordAdminStats(range)
      .then((payload) => {
        if (cancelled) return;
        setStats(payload);
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
  }, [range]);

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

  return (
    <AppShell user={user}>
      <PageLayout
        title="Discord"
        subtitle="Discordstatistieken"
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
              <StatCard label="Berichten" value={stats.summary.messagesInRange} />
              <StatCard label="Berichten totaal" value={stats.summary.messagesTotal} />
              <StatCard label="Unieke auteurs" value={stats.summary.uniqueAuthors} />
              <StatCard label="Bijlagen" value={stats.summary.attachmentsInRange} />
              <StatCard
                label="Gem. woorden"
                value={stats.summary.avgWordCount}
                hint="Gemiddeld aantal woorden per bericht"
              />
              <StatCard
                label="Antwoorden"
                value={stats.summary.replyCount}
                hint={`Antwoordpercentage ${formatPercent(stats.summary.replyRate)}`}
              />
              <StatCard
                label="Verwijderd"
                value={stats.summary.deletedInRange}
                hint="Berichten die in deze periode zijn verwijderd. Tellen niet mee in het berichttotaal."
              />
              <StatCard
                label="Reacties"
                value={stats.summary.reactionsInRange}
                hint="Totaal aantal emoji-reacties op berichten in deze periode"
              />
              <StatCard label="Spraaksessies" value={stats.summary.voiceSessionsInRange} />
              <StatCard label="Spraaksessies totaal" value={stats.summary.voiceSessionsTotal} />
              <StatCard
                label="Spraaktijd"
                value={formatDuration(stats.summary.voiceSecondsClosed)}
                hint={voiceHint}
              />
              <StatCard
                label="Gem. sessieduur"
                value={formatDuration(stats.summary.voiceAverageSeconds)}
                hint={
                  stats.summary.voiceOpenInRange > 0
                    ? `${stats.summary.voiceOpenInRange} open sessie(s) in deze periode`
                    : voiceHint
                }
              />
              <StatCard label="Actief in periode" value={stats.summary.activeUsers} />
              <StatCard
                label="Ledental"
                value={stats.summary.memberCount ?? "—"}
                hint={
                  stats.summary.memberCountRecordedAt
                    ? `Laatste snapshot ${formatDateTime(stats.summary.memberCountRecordedAt, timezone)}`
                    : "Op basis van bekende leden"
                }
              />
              <StatCard
                label="Vastgelopen spraak"
                value={stats.summary.voiceUnreliableClosed}
                hint="Afgesloten sessies langer dan 24 uur, vermoedelijk crash-restanten. Niet meegeteld in de spraaktijd."
              />
            </div>

            <div className="adminSplit">
              <PagePanel>
                <h2 className="cardTitle">Berichten in de tijd</h2>
                <p className="cardHint">
                  {range === "all"
                    ? `Per maand in de guild-tijdzone (${stats.timezone}).`
                    : `Per dag in de guild-tijdzone (${stats.timezone}).`}
                </p>
                <BarList
                  items={stats.messagesOverTime.map((row) => ({
                    label: row.key,
                    value: row.count,
                  }))}
                  empty="Nog geen Discord-berichten in deze periode."
                />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Spraakminuten in de tijd</h2>
                <p className="cardHint">{voiceHint}</p>
                <BarList
                  items={stats.voiceMinutesOverTime.map((row) => ({
                    label: row.key,
                    value: row.count,
                  }))}
                  empty="Nog geen afgesloten spraaksessies in deze periode."
                />
              </PagePanel>
            </div>

            <div className="adminSplit">
              <PagePanel>
                <h2 className="cardTitle">Piekuren</h2>
                <p className="cardHint">Wanneer er berichten verstuurd worden.</p>
                <HourChart hours={stats.peakHours} />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Spraakpiekuren</h2>
                <p className="cardHint">Wanneer spraaksessies starten.</p>
                <HourChart hours={stats.voicePeakHours} />
              </PagePanel>
            </div>

            <div className="adminSplit">
              <PagePanel>
                <h2 className="cardTitle">Meest actieve gebruikers</h2>
                <BarList
                  items={stats.topUsersByMessages.map((row) => ({
                    label: row.displayName,
                    value: row.count,
                  }))}
                  empty="Nog geen berichten in deze periode."
                />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Meest gebruikte emoji</h2>
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
                <h2 className="cardTitle">Berichten per kanaal</h2>
                <BarList
                  items={stats.topChannelsByMessages.map((row) => ({
                    label: row.name,
                    value: row.count,
                  }))}
                  empty="Nog geen kanaalactiviteit in deze periode."
                />
              </PagePanel>
              <PagePanel>
                <h2 className="cardTitle">Spraak per kanaal</h2>
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
              <h2 className="cardTitle">Meest actieve spraakgebruikers</h2>
              <p className="cardHint">{voiceHint}</p>
              <BarList
                items={stats.topUsersByVoiceSeconds.map((row) => ({
                  label: row.displayName,
                  value: Math.round(row.seconds / 60),
                }))}
                empty="Nog geen afgesloten spraaksessies in deze periode."
              />
            </PagePanel>

            <PagePanel>
              <h2 className="cardTitle">Ledental in de tijd</h2>
              <p className="cardHint">
                Snapshots worden nu bij het opstarten van de bot genomen, dus de reeks is spaarzaam.
              </p>
              <BarList
                items={stats.memberCountOverTime.map((row) => ({
                  label: row.key,
                  value: row.count,
                }))}
                empty="Nog geen ledental-snapshots in deze periode."
              />
            </PagePanel>

            <PagePanel>
              <h2 className="cardTitle">Botgebruik</h2>
              <p className="cardHint">
                Slash commands en knoppen in Discord. Berichtinhoud wordt niet bewaard.
              </p>
              <div className="adminStatGrid">
                <StatCard label="Botacties" value={stats.botUsage.total} />
                <StatCard label="Roosterdagen" value={stats.botUsage.timetableDayClicks} />
                <StatCard label="F1-statistieken" value={stats.botUsage.f1StatsClicks} />
              </div>
              <div className="adminSplit">
                <div>
                  <h3 className="adminSubhead">Commands</h3>
                  <BarList
                    items={stats.botUsage.commands.map((row) => ({
                      label: COMMAND_LABELS[row.key] ?? `/${row.key}`,
                      value: row.count,
                    }))}
                    empty="Nog geen slash commands in deze periode."
                  />
                </div>
                <div>
                  <h3 className="adminSubhead">Botacties in de tijd</h3>
                  <BarList
                    items={stats.botUsage.overTime.map((row) => ({
                      label: row.key,
                      value: row.count,
                    }))}
                    empty="Nog geen botacties in deze periode."
                  />
                </div>
              </div>
            </PagePanel>

            <PagePanel>
              <h2 className="cardTitle">Recente Discordactiviteit</h2>
              <p className="cardHint">
                Metadata van recente berichten en spraaksessies. Berichtinhoud wordt niet getoond.
              </p>
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
                        <th>Kanaal</th>
                        <th>Duur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((row, index) => (
                        <tr key={`${row.type}-${row.occurredAt}-${row.userId}-${index}`}>
                          <td>{row.displayName}</td>
                          <td>{formatDateTime(row.occurredAt, timezone)}</td>
                          <td>{row.type === "message" ? "Bericht" : "Spraak"}</td>
                          <td>{row.channelName}</td>
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

            <PagePanel>
              <h2 className="cardTitle">Gebruikers</h2>
              <p className="cardHint">
                Leden met Discordactiviteit in de geselecteerde periode. Berichtinhoud wordt niet
                bewaard of getoond.
              </p>
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
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

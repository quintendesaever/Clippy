import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteCalendar, getCalendar, saveCalendar } from "../api";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import type { CalendarEntry, DiscordUser } from "../types";

const TIMEZONE_OPTIONS = [
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/London",
  "UTC",
] as const;

const DEFAULT_TIMEZONE = TIMEZONE_OPTIONS[0];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Donker" },
  { value: "light", label: "Licht" },
  { value: "system", label: "Systeem" },
];

export default function Settings({ user }: { user: DiscordUser }) {
  const { preference, setPreference } = useTheme();
  const [initials, setInitials] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [showLocation, setShowLocation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<CalendarEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCalendar()
      .then((cal) => {
        if (cancelled) return;
        if (cal.calendar) {
          setExisting(cal.calendar);
          setInitials(cal.calendar.initials);
          setIcsUrl(cal.calendar.ics_url ?? "");
          setTimezone(cal.calendar.timezone || DEFAULT_TIMEZONE);
          setShowLocation(Boolean(cal.calendar.show_location));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const timezoneOptions =
    timezone && !(TIMEZONE_OPTIONS as readonly string[]).includes(timezone)
      ? [...TIMEZONE_OPTIONS, timezone]
      : [...TIMEZONE_OPTIONS];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await saveCalendar({
        initials,
        ics_url: icsUrl || undefined,
        timezone: timezone || undefined,
        show_location: showLocation,
      });
      if (result.calendar) {
        setExisting(result.calendar);
        setShowLocation(Boolean(result.calendar.show_location));
      }
      setMessage("Kalender opgeslagen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Je kalender verwijderen uit het gedeelde rooster?")) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await deleteCalendar();
      setExisting(null);
      setInitials("");
      setIcsUrl("");
      setTimezone(DEFAULT_TIMEZONE);
      setShowLocation(false);
      setMessage("Kalender verwijderd.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell user={user}>
      <PageLayout title="Instellingen" subtitle="Weergave en kalender">
        <PagePanel className="pagePanelNarrow">
          <h2 className="cardTitle">Weergave</h2>
          <p className="cardHint">Kies een thema voor het dashboard.</p>
          <div className="topBarTabs themePicker" role="radiogroup" aria-label="Thema">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={preference === option.value}
                className={`topBarTab ${preference === option.value ? "topBarTabActive" : ""}`}
                onClick={() => setPreference(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PagePanel>
        {loading ? (
          <p className="timetableLoading">Laden…</p>
        ) : (
          <PagePanel className="pagePanelNarrow">
            <h2 className="cardTitle">Mijn kalender</h2>
            <p className="cardHint">
              Koppel je ICS-kalender voor het gedeelde rooster. Bekijk het op{" "}
              <Link to="/timetable">het rooster</Link> of via <code>/timetable</code> in Discord.
            </p>
            <form onSubmit={handleSave} className="form">
              <label className="formLabel">
                Naam
                <input
                  className="formInput"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value)}
                  placeholder="bv. Quinten"
                  maxLength={32}
                  required
                />
              </label>
              <label className="formLabel">
                ICS-URL
                <input
                  className="formInput"
                  type="url"
                  value={icsUrl}
                  onChange={(e) => setIcsUrl(e.target.value)}
                  placeholder="https://…/calendar.ics"
                />
              </label>
              <label className="formLabel">
                Tijdzone
                <select
                  className="formInput formSelect"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <label className="formToggleRow">
                <span>Toon locatie aan andere leden</span>
                <span className="toggleSwitch">
                  <input
                    type="checkbox"
                    checked={showLocation}
                    onChange={(e) => setShowLocation(e.target.checked)}
                  />
                  <span className="toggleTrack" aria-hidden="true">
                    <span className="toggleThumb" />
                  </span>
                </span>
              </label>
              <div className="formActions">
                <Button type="submit" disabled={saving}>
                  {saving ? "Opslaan…" : "Opslaan"}
                </Button>
                {existing && (
                  <Button variant="secondary" onClick={handleRemove} disabled={saving}>
                    Verwijderen
                  </Button>
                )}
              </div>
            </form>
            {message && <p className="successMsg">{message}</p>}
            {error && <p className="errorMsg">{error}</p>}
          </PagePanel>
        )}
      </PageLayout>
    </AppShell>
  );
}

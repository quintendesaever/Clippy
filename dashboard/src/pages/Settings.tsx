import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteCalendar, getCalendar, saveCalendar } from "../api";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import { usePreferences } from "../hooks/usePreferences";
import type { CalendarEntry, DiscordUser } from "../types";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Donker" },
  { value: "light", label: "Licht" },
  { value: "system", label: "Systeem" },
];

export default function Settings({ user }: { user: DiscordUser }) {
  const { preference, setPreference } = useTheme();
  const { showTypePrefix, setShowTypePrefix, shareLocation, setShareLocation } = usePreferences();
  const [initials, setInitials] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
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

  async function handleShareLocation(next: boolean) {
    setSavingShare(true);
    setShareError(null);
    try {
      await setShareLocation(next);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSavingShare(false);
    }
  }

  async function handleTypePrefixToggle(checked: boolean) {
    setSavingPrefix(true);
    setPrefixError(null);
    try {
      await setShowTypePrefix(checked);
    } catch (err) {
      setPrefixError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSavingPrefix(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await saveCalendar({
        initials,
        ics_url: icsUrl || undefined,
      });
      if (result.calendar) {
        setExisting(result.calendar);
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
          <p className="cardHint">Thema en weergave van het dashboard.</p>
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
          <label className="formToggleRow">
            <span>Toon type in titel</span>
            <span className="toggleSwitch">
              <input
                type="checkbox"
                checked={showTypePrefix}
                disabled={savingPrefix}
                onChange={(e) => handleTypePrefixToggle(e.target.checked)}
              />
              <span className="toggleTrack" aria-hidden="true">
                <span className="toggleThumb" />
              </span>
            </span>
          </label>
          <p className="cardHint">
            Zet Hoorcollege, Project, … voor de vaknaam op het webrooster. Dit wordt bewaard in je
            account, dus het geldt op elk apparaat. Discord blijft type als pill tonen.
          </p>
          {prefixError && <p className="errorMsg">{prefixError}</p>}
          <h2 className="cardTitle" style={{ marginTop: "1.5rem" }}>
            Locatie delen
          </h2>
          <p className="cardHint">
            Als dit aan staat, kunnen andere leden je ICS-lokaal en je laatst gedetecteerde
            dashboardlocatie (stad/regio, geen GPS) zien. Uitgeschakeld blijft persoonlijke locatie
            verborgen. Activiteitslocaties die je zelf invult blijven zichtbaar.
          </p>
          <div className="topBarTabs themePicker" role="radiogroup" aria-label="Locatie delen">
            <button
              type="button"
              role="radio"
              aria-checked={shareLocation}
              className={`topBarTab ${shareLocation ? "topBarTabActive" : ""}`}
              disabled={savingShare}
              onClick={() => handleShareLocation(true)}
            >
              Ingeschakeld
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!shareLocation}
              className={`topBarTab ${!shareLocation ? "topBarTabActive" : ""}`}
              disabled={savingShare}
              onClick={() => handleShareLocation(false)}
            >
              Uitgeschakeld
            </button>
          </div>
          {shareError && <p className="errorMsg">{shareError}</p>}
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

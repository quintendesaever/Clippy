import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteCalendar, getCalendar, logout, saveCalendar } from "../api";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import { useTheme, type Appearance } from "../hooks/useTheme";
import { useMemberColors } from "../hooks/useMemberColors";
import { UserAvatar } from "../components/Avatar";
import { usePreferences } from "../hooks/usePreferences";
import type { CalendarEntry, DiscordUser } from "../types";

const APPEARANCE_OPTIONS: { value: Appearance; label: string; hint: string }[] = [
  { value: "modern", label: "Modern", hint: "Huidige donkere dashboardstijl" },
  { value: "classic", label: "Classic", hint: "Oudere productiekleuren" },
  { value: "light", label: "Licht", hint: "Lichte modus" },
];

function PreferenceToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  error?: string | null;
}) {
  return (
    <div className="settingsPrefBlock">
      <label className="formToggleRow">
        <span>{label}</span>
        <span className="toggleSwitch">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="toggleTrack" aria-hidden="true">
            <span className="toggleThumb" />
          </span>
        </span>
      </label>
      {hint && <p className="cardHint">{hint}</p>}
      {error && <p className="errorMsg">{error}</p>}
    </div>
  );
}

export default function Settings({ user }: { user: DiscordUser }) {
  const { appearance, setAppearance } = useTheme();
  const { showTypePrefix, setShowTypePrefix, shareLocation, setShareLocation } = usePreferences();
  const { showMemberColors, setShowMemberColors } = useMemberColors();
  const displayName = user.nickname ?? user.username;
  const [initials, setInitials] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      window.location.href = "/";
    } catch {
      setLoggingOut(false);
    }
  }

  const calendarLinked = Boolean(existing?.ics_url);

  return (
    <AppShell user={user}>
      <PageLayout title="Instellingen">
        <div className="settingsStack">
          <PagePanel>
            <h2 className="cardTitle">Account</h2>
            <p className="cardHint">Ingelogd via Discord. Uitloggen is hier beschikbaar op elk apparaat.</p>
            <div className="settingsAccountRow">
              <UserAvatar userId={user.id} avatar={user.avatar} size="sm" alt={displayName} />
              <div className="settingsAccountInfo">
                <span className="settingsAccountName">{displayName}</span>
                <span className="settingsAccountHandle">@{user.username}</span>
              </div>
              <Button variant="secondary" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? "Uitloggen…" : "Uitloggen"}
              </Button>
            </div>
          </PagePanel>

          <PagePanel>
            <h2 className="cardTitle">Weergave</h2>
            <p className="cardHint">Lokaal op dit apparaat.</p>
            <div className="topBarTabs themePicker" role="radiogroup" aria-label="Thema">
              {APPEARANCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={appearance === option.value}
                  title={option.hint}
                  className={`topBarTab ${appearance === option.value ? "topBarTabActive" : ""}`}
                  onClick={() => setAppearance(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </PagePanel>

          <PagePanel>
            <h2 className="cardTitle">Rooster</h2>
            <PreferenceToggle
              label="Type in titel tonen"
              checked={showTypePrefix}
              disabled={savingPrefix}
              onChange={handleTypePrefixToggle}
              error={prefixError}
            />
            <PreferenceToggle
              label="Lidkleuren in gedeeld rooster"
              hint="Kleur per persoon. Activiteiten met meerdere leden krijgen een meerkleurige bovenrand."
              checked={showMemberColors}
              onChange={setShowMemberColors}
            />
          </PagePanel>

          <PagePanel>
            <h2 className="cardTitle">Privacy</h2>
            <PreferenceToggle
              label="Leslocaties delen"
              checked={shareLocation}
              disabled={savingShare}
              onChange={handleShareLocation}
              error={shareError}
            />
            <p className="settingsStateLine" aria-live="polite">
              Status:{" "}
              <span className={shareLocation ? "settingsStateOn" : "settingsStateOff"}>
                {shareLocation ? "Ingeschakeld" : "Uitgeschakeld"}
              </span>
              {savingShare ? " · Opslaan…" : ""}
            </p>
            <p className="cardHint">
              Uit: andere leden zien je les-/activiteitslocatie niet. Bezoekerslocatie blijft alleen
              voor beheerders.
            </p>
          </PagePanel>

          <PagePanel>
            <div className="settingsPanelHead">
              <div>
                <h2 className="cardTitle">Kalender</h2>
                <p className="cardHint">
                  Nodig voor het <Link to="/timetable">gedeelde rooster</Link>.
                </p>
              </div>
              {!loading && (
                <span
                  className={`settingsStatusBadge ${
                    calendarLinked ? "settingsStatusLinked" : "settingsStatusEmpty"
                  }`}
                >
                  {calendarLinked ? "Gekoppeld" : existing ? "Zonder ICS-URL" : "Niet gekoppeld"}
                </span>
              )}
            </div>

            {loading ? (
              <p className="timetableLoading">Kalender laden…</p>
            ) : (
              <form onSubmit={handleSave} className="form settingsForm">
                <label className="formLabel">
                  Weergavenaam
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
                  <span className="formCheckHint">
                    Verplicht voor het gedeelde rooster. Zonder URL kun je dat rooster niet openen.
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
                {message && <p className="successMsg">{message}</p>}
                {error && <p className="errorMsg">{error}</p>}
              </form>
            )}
          </PagePanel>
        </div>
      </PageLayout>
    </AppShell>
  );
}

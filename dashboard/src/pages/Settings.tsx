import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteCalendar, getCalendar, saveCalendar } from "../api";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import type { CalendarEntry, DiscordUser } from "../types";

export default function Settings({ user }: { user: DiscordUser }) {
  const [initials, setInitials] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [timezone, setTimezone] = useState("");
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
          setTimezone(cal.calendar.timezone);
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
      });
      setExisting(result.calendar);
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
      setTimezone("");
      setMessage("Kalender verwijderd.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell user={user} narrow>
        <p className="timetableLoading">Laden…</p>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} narrow>
      <section className="card">
        <h2 className="cardTitle">Mijn kalender</h2>
        <p className="cardHint">
          Koppel je ICS-kalender voor het gedeelde rooster. Bekijk het op{" "}
          <Link to="/timetable">het rooster</Link> of via <code>/timetable</code> in Discord.
        </p>
        <form onSubmit={handleSave} className="form">
          <label className="formLabel">
            Initialen
            <input
              className="formInput"
              value={initials}
              onChange={(e) => setInitials(e.target.value)}
              placeholder="bv. QD"
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
            Tijdzone (optioneel)
            <input
              className="formInput"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="bv. Europe/Brussels"
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
      </section>
    </AppShell>
  );
}

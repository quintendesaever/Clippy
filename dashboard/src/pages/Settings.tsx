import { useEffect, useState } from "react";
import { deleteCalendar, getCalendar, logout, saveCalendar } from "../api";
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
          setError(err instanceof Error ? err.message : "Failed to load calendar");
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
      setMessage("Calendar saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove your calendar from the shared timetable?")) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await deleteCalendar();
      setExisting(null);
      setInitials("");
      setIcsUrl("");
      setTimezone("");
      setMessage("Calendar removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="app">
        <main className="main">
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="appHeader">
        <span className="appTitle">Clippy Settings</span>
        <span className="userLabel">@{user.username}</span>
        <button type="button" className="btn btnSecondary" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <main className="main">
        <section className="card">
          <h2 className="cardTitle">My calendar</h2>
          <p className="cardHint">
            Link your ICS calendar for the shared timetable. Viewing the timetable will be available
            in Discord later.
          </p>
          <form onSubmit={handleSave} className="form">
            <label className="formLabel">
              Initials
              <input
                className="formInput"
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                placeholder="e.g. QD"
                maxLength={32}
                required
              />
            </label>
            <label className="formLabel">
              ICS URL
              <input
                className="formInput"
                type="url"
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="https://…/calendar.ics"
              />
            </label>
            <label className="formLabel">
              Timezone (optional)
              <input
                className="formInput"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Europe/Brussels"
              />
            </label>
            <div className="formActions">
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              {existing && (
                <button
                  type="button"
                  className="btn btnSecondary"
                  onClick={handleRemove}
                  disabled={saving}
                >
                  Remove
                </button>
              )}
            </div>
          </form>
          {message && <p className="successMsg">{message}</p>}
          {error && <p className="errorMsg">{error}</p>}
        </section>
      </main>
    </div>
  );
}

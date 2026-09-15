import { useState } from "react";
import { Link } from "react-router-dom";
import { saveCalendar } from "../api";
import Button from "./Button";

type SharedTimetableGateProps = {
  defaultInitials: string;
  onConnected: () => void;
};

export default function SharedTimetableGate({
  defaultInitials,
  onConnected,
}: SharedTimetableGateProps) {
  const [initials, setInitials] = useState(defaultInitials);
  const [icsUrl, setIcsUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveCalendar({ initials: initials.trim(), ics_url: icsUrl.trim() });
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kalender koppelen mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="timetableGateOverlay" role="presentation">
      <div className="timetableGate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <h2 id="gate-title" className="cardTitle">Koppel je kalender</h2>
        <p className="cardHint">
          Voeg je ICS-kalender toe om het gedeelde rooster te bekijken.
        </p>
        <form className="timetableGateForm" onSubmit={handleSubmit}>
          <label className="formLabel">
            Initialen
            <input
              className="formInput"
              value={initials}
              onChange={(event) => setInitials(event.target.value)}
              maxLength={12}
              placeholder="bv. QD"
              required
              autoFocus
            />
          </label>
          <label className="formLabel">
            ICS-link
            <input
              className="formInput"
              type="url"
              value={icsUrl}
              onChange={(event) => setIcsUrl(event.target.value)}
              placeholder="https://…/calendar.ics"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {error && <p className="errorMsg">{error}</p>}
          <div className="formActions">
            <Button type="submit" disabled={saving}>
              {saving ? "Koppelen…" : "Kalender koppelen"}
            </Button>
            <Link className="btn btnSecondary" to="/settings">
              Naar instellingen
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getBotSettings, saveBotSettings } from "../api";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import type { BotSettingsPayload, DiscordUser } from "../types";

function PreferenceToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
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
    </div>
  );
}

export default function BotSettings({ user }: { user: DiscordUser }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [predictionUrl, setPredictionUrl] = useState("");
  const [channels, setChannels] = useState<BotSettingsPayload["channels"]>([]);
  const [roles, setRoles] = useState<BotSettingsPayload["roles"]>([]);

  function applyPayload(payload: BotSettingsPayload) {
    setTimezone(payload.timezone);
    setEnabled(payload.f1.enabled);
    setChannelId(payload.f1.channelId ?? "");
    setRoleId(payload.f1.roleId ?? "");
    setPredictionUrl(payload.f1.predictionUrl ?? "");
    setChannels(payload.channels);
    setRoles(payload.roles);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBotSettings()
      .then((payload) => {
        if (cancelled) return;
        applyPayload(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Laden mislukt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await saveBotSettings({
        timezone: timezone.trim(),
        f1: {
          enabled,
          channelId: channelId || null,
          roleId: roleId || null,
          predictionUrl: predictionUrl.trim() || null,
        },
      });
      applyPayload(payload);
      setMessage("Opgeslagen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell user={user}>
      <PageLayout
        title="Bot"
        subtitle="Serverinstellingen die je nu via Discord-slashcommands beheert."
      >
        {loading ? (
          <PagePanel>
            <p className="cardHint">Laden…</p>
          </PagePanel>
        ) : (
          <>
            <PagePanel>
              <h2 className="cardTitle">Server</h2>
              <p className="cardHint">
                Tijdzone voor stats, rooster en F1-herinneringen (IANA, bv. Europe/Brussels).
              </p>
              <label className="settingsFieldLabel" htmlFor="bot-timezone">
                Tijdzone
              </label>
              <input
                id="bot-timezone"
                className="formInput"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Brussels"
                autoComplete="off"
                spellCheck={false}
              />
            </PagePanel>

            <PagePanel>
              <div className="settingsPanelHead">
                <div>
                  <h2 className="cardTitle">F1-herinneringen</h2>
                  <p className="cardHint">
                    Kanaal, rol en prediction-link. Testberichten blijven in Discord via{" "}
                    <code>/f1-reminder test-send</code>.
                  </p>
                </div>
              </div>

              <PreferenceToggle
                label="Herinneringen ingeschakeld"
                hint="Zet uit om geplande F1-berichten te pauzeren."
                checked={enabled}
                disabled={saving}
                onChange={setEnabled}
              />

              <label className="settingsFieldLabel" htmlFor="bot-f1-channel">
                Kanaal
              </label>
              <select
                id="bot-f1-channel"
                className="formInput formSelect"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={saving}
              >
                <option value="">— Kies een kanaal —</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>

              <label className="settingsFieldLabel" htmlFor="bot-f1-role">
                Rol
              </label>
              <select
                id="bot-f1-role"
                className="formInput formSelect"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={saving}
              >
                <option value="">— Kies een rol —</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    @{role.name}
                  </option>
                ))}
              </select>

              <label className="settingsFieldLabel" htmlFor="bot-f1-url">
                Prediction-URL
              </label>
              <input
                id="bot-f1-url"
                className="formInput"
                value={predictionUrl}
                onChange={(e) => setPredictionUrl(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
                spellCheck={false}
                disabled={saving}
              />
              <p className="cardHint">
                Publieke https-URL zonder inloggegevens. Leeg laten verwijdert de knop.
              </p>
            </PagePanel>

            <PagePanel>
              {error && <p className="errorMsg">{error}</p>}
              {message && <p className="successMsg">{message}</p>}
              <Button onClick={handleSave} disabled={saving} block>
                {saving ? "Opslaan…" : "Opslaan"}
              </Button>
              <p className="settingsStateLine">
                Discord-commando’s zoals <code>/stats sync-members</code> blijven voorlopig
                beschikbaar voor sync en tests.
              </p>
            </PagePanel>
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

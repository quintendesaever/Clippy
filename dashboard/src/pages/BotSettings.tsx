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

export default function BotSettings({ user }: { user: DiscordUser }) {
  const [loading, setLoading] = useState(true);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [savingF1, setSavingF1] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [f1Error, setF1Error] = useState<string | null>(null);
  const [timezoneMessage, setTimezoneMessage] = useState<string | null>(null);
  const [f1Message, setF1Message] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
    getBotSettings()
      .then((payload) => {
        if (cancelled) return;
        applyPayload(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Laden mislukt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveTimezone() {
    setSavingTimezone(true);
    setTimezoneError(null);
    setTimezoneMessage(null);
    try {
      const payload = await saveBotSettings({ timezone: timezone.trim() });
      applyPayload(payload);
      setTimezoneMessage("Opgeslagen.");
    } catch (err) {
      setTimezoneError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSavingTimezone(false);
    }
  }

  async function handleSaveF1(nextEnabled?: boolean) {
    setSavingF1(true);
    setF1Error(null);
    setF1Message(null);
    const enabledValue = nextEnabled ?? enabled;
    if (nextEnabled !== undefined) setEnabled(nextEnabled);
    try {
      const payload = await saveBotSettings({
        f1: {
          enabled: enabledValue,
          channelId: channelId || null,
          roleId: roleId || null,
          predictionUrl: predictionUrl.trim() || null,
        },
      });
      applyPayload(payload);
      setF1Message("Opgeslagen.");
    } catch (err) {
      if (nextEnabled !== undefined) setEnabled(!nextEnabled);
      setF1Error(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSavingF1(false);
    }
  }

  return (
    <AppShell user={user}>
      <PageLayout title="Bot">
        <div className="settingsStack">
          {loading ? (
            <PagePanel>
              <p className="cardHint">Laden…</p>
            </PagePanel>
          ) : loadError ? (
            <PagePanel>
              <p className="errorMsg">{loadError}</p>
            </PagePanel>
          ) : (
            <>
              <PagePanel>
                <h2 className="cardTitle">Server</h2>
                <p className="cardHint">
                  Tijdzone voor stats, rooster en F1-herinneringen (IANA, bv. Europe/Brussels).
                </p>
                <div className="botSettingsFields">
                  <label className="botSettingsField" htmlFor="bot-timezone">
                    <span>Tijdzone</span>
                    <input
                      id="bot-timezone"
                      className="formInput"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="Europe/Brussels"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={savingTimezone}
                    />
                  </label>
                </div>
                {timezoneError && <p className="errorMsg">{timezoneError}</p>}
                {timezoneMessage && <p className="successMsg">{timezoneMessage}</p>}
                <div className="settingsActions">
                  <Button onClick={handleSaveTimezone} disabled={savingTimezone}>
                    {savingTimezone ? "Opslaan…" : "Opslaan"}
                  </Button>
                </div>
              </PagePanel>

              <PagePanel>
                <h2 className="cardTitle">F1-herinneringen</h2>
                <p className="cardHint">
                  Kanaal, rol en prediction-link. Testberichten blijven in Discord via{" "}
                  <code>/f1-reminder test-send</code>.
                </p>

                <PreferenceToggle
                  label="Herinneringen ingeschakeld"
                  hint="Zet uit om geplande F1-berichten te pauzeren."
                  checked={enabled}
                  disabled={savingF1}
                  onChange={(next) => {
                    void handleSaveF1(next);
                  }}
                />

                <div className="botSettingsFields botSettingsGrid">
                  <label className="botSettingsField" htmlFor="bot-f1-channel">
                    <span>Kanaal</span>
                    <select
                      id="bot-f1-channel"
                      className="formInput formSelect"
                      value={channelId}
                      onChange={(e) => setChannelId(e.target.value)}
                      disabled={savingF1}
                    >
                      <option value="">— Kies een kanaal —</option>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          #{channel.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="botSettingsField" htmlFor="bot-f1-role">
                    <span>Rol</span>
                    <select
                      id="bot-f1-role"
                      className="formInput formSelect"
                      value={roleId}
                      onChange={(e) => setRoleId(e.target.value)}
                      disabled={savingF1}
                    >
                      <option value="">— Kies een rol —</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          @{role.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className="botSettingsField botSettingsFieldWide"
                    htmlFor="bot-f1-url"
                  >
                    <span>Prediction-URL</span>
                    <input
                      id="bot-f1-url"
                      className="formInput"
                      value={predictionUrl}
                      onChange={(e) => setPredictionUrl(e.target.value)}
                      placeholder="https://…"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={savingF1}
                    />
                    <small>Publieke https-URL; leeg laten verwijdert de knop.</small>
                  </label>
                </div>

                <p className="settingsStateLine" aria-live="polite">
                  Status:{" "}
                  <span className={enabled ? "settingsStateOn" : "settingsStateOff"}>
                    {enabled ? "Ingeschakeld" : "Uitgeschakeld"}
                  </span>
                  {savingF1 ? " · Opslaan…" : ""}
                </p>
                {f1Error && <p className="errorMsg">{f1Error}</p>}
                {f1Message && <p className="successMsg">{f1Message}</p>}
                <div className="settingsActions">
                  <Button onClick={() => void handleSaveF1()} disabled={savingF1}>
                    {savingF1 ? "Opslaan…" : "Opslaan"}
                  </Button>
                </div>
              </PagePanel>

              <PagePanel>
                <h2 className="cardTitle">Discord</h2>
                <p className="cardHint">
                  Sync en tests blijven via slashcommands:{" "}
                  <code>/stats sync-members</code>, <code>/f1-reminder test-send</code>.
                </p>
              </PagePanel>
            </>
          )}
        </div>
      </PageLayout>
    </AppShell>
  );
}

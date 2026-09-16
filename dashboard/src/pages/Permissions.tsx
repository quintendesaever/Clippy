import { useEffect, useMemo, useState } from "react";
import {
  getPermissionChannel,
  getPermissionMember,
  getPermissionRole,
  getPermissionsOverview,
} from "../api";
import { StatCard } from "../components/AdminCharts";
import AdminSection from "../components/AdminSection";
import AppShell from "../components/AppShell";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import type {
  DiscordUser,
  PermissionChannelInspectionDto,
  PermissionFindingDto,
  PermissionFindingSeverity,
  PermissionFlagDto,
  PermissionMemberInspectionDto,
  PermissionRoleInspectionDto,
  PermissionsOverviewDto,
} from "../types";

type Tab = "audit" | "roles" | "channels" | "members";

const TABS: { id: Tab; label: string }[] = [
  { id: "audit", label: "Audit" },
  { id: "roles", label: "Rollen" },
  { id: "channels", label: "Kanalen" },
  { id: "members", label: "Leden" },
];

const SEVERITY_LABEL: Record<PermissionFindingSeverity, string> = {
  fail: "Incorrect",
  warn: "Controleren",
  ok: "Verwacht",
};

const SEVERITY_STATUS: Record<PermissionFindingSeverity, "unavailable" | "degraded" | "ok"> = {
  fail: "unavailable",
  warn: "degraded",
  ok: "ok",
};

const KIND_LABEL: Record<PermissionsOverviewDto["roles"][number]["kind"], string> = {
  everyone: "@everyone",
  staff: "Staff",
  managed: "Beheerd (integratie/bot)",
  decorative: "Decoratief",
  human: "Lidrol",
};

const CHANNEL_TYPE_LABEL: Record<PermissionsOverviewDto["channels"][number]["type"], string> = {
  text: "Tekst",
  announcement: "Aankondiging",
  category: "Categorie",
};

const SYNC_LABEL: Record<PermissionChannelInspectionDto["syncState"], string> = {
  synced: "Gesynchroniseerd met de categorie",
  unsynced: "Niet gesynchroniseerd met de categorie",
  category: "Dit is een categorie",
  none: "Geen categorie",
};

const SOURCE_LABEL: Record<PermissionChannelInspectionDto["overwrites"][number]["source"], string> = {
  base: "Categoriebasis",
  category: "Categorie",
  inherited: "Overgenomen (sync)",
  explicit: "Expliciete override",
};

function matchesQuery(haystack: string, query: string): boolean {
  if (!query.trim()) return true;
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

function formatKeys(keys: string[]): string {
  return keys.length ? keys.join(", ") : "geen";
}

function PermissionBits({
  entries,
  mode,
}: {
  entries: PermissionFlagDto[];
  mode: "granted" | "allowed";
}) {
  const visible = entries.filter((entry) => (mode === "granted" ? entry.granted : true));
  if (visible.length === 0) {
    return <p className="cardHint">Geen relevante bits {mode === "granted" ? "expliciet toegekend" : "berekend"}.</p>;
  }
  return (
    <ul className="permissionsBitList">
      {visible.map((entry) => {
        const on = mode === "granted" ? entry.granted : entry.allowed;
        return (
          <li key={entry.key} className={on ? "permissionsBitOn" : "permissionsBitOff"}>
            <span aria-hidden="true">{on ? "✓" : "✗"}</span>
            {entry.label}
          </li>
        );
      })}
    </ul>
  );
}

function FindingList({ findings, empty }: { findings: PermissionFindingDto[]; empty: string }) {
  if (findings.length === 0) return <p className="cardHint">{empty}</p>;
  return (
    <ul className="permissionsFindingList">
      {findings.map((finding) => (
                        <li key={`${finding.code}-${finding.target ?? finding.title}`} className="permissionsFinding">
          <div className="permissionsFindingHead">
            <span className={`statusBadge statusBadge-${SEVERITY_STATUS[finding.severity]}`}>
              {SEVERITY_LABEL[finding.severity]}
            </span>
            <strong>{finding.title}</strong>
          </div>
          <p>{finding.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Permissions({ user }: { user: DiscordUser }) {
  const [tab, setTab] = useState<Tab>("audit");
  const [overview, setOverview] = useState<PermissionsOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roleQuery, setRoleQuery] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [roleId, setRoleId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberChannelId, setMemberChannelId] = useState("");

  const [role, setRole] = useState<PermissionRoleInspectionDto | null>(null);
  const [channel, setChannel] = useState<PermissionChannelInspectionDto | null>(null);
  const [member, setMember] = useState<PermissionMemberInspectionDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPermissionsOverview()
      .then((payload) => {
        if (cancelled) return;
        setOverview(payload);
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
  }, []);

  useEffect(() => {
    if (!roleId) {
      setRole(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getPermissionRole(roleId)
      .then((payload) => {
        if (!cancelled) setRole(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setRole(null);
          setDetailError(err instanceof Error ? err.message : "Rol laden mislukt");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roleId]);

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getPermissionChannel(channelId)
      .then((payload) => {
        if (!cancelled) setChannel(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setChannel(null);
          setDetailError(err instanceof Error ? err.message : "Kanaal laden mislukt");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!memberId || !memberChannelId) {
      setMember(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getPermissionMember(memberId, memberChannelId)
      .then((payload) => {
        if (!cancelled) setMember(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setMember(null);
          setDetailError(err instanceof Error ? err.message : "Lid laden mislukt");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, memberChannelId]);

  const roles = useMemo(
    () => (overview?.roles ?? []).filter((entry) => matchesQuery(`${entry.name} ${entry.id}`, roleQuery)),
    [overview, roleQuery]
  );
  const channels = useMemo(
    () =>
      (overview?.channels ?? []).filter((entry) =>
        matchesQuery(`${entry.name} ${entry.parentName ?? ""} ${entry.id}`, channelQuery)
      ),
    [overview, channelQuery]
  );
  const members = useMemo(
    () =>
      (overview?.members ?? []).filter((entry) =>
        matchesQuery(`${entry.displayName} ${entry.username ?? ""} ${entry.id}`, memberQuery)
      ),
    [overview, memberQuery]
  );

  const grouped = useMemo(() => {
    const findings = overview?.findings ?? [];
    return {
      fail: findings.filter((finding) => finding.severity === "fail"),
      warn: findings.filter((finding) => finding.severity === "warn"),
      ok: findings.filter((finding) => finding.severity === "ok"),
    };
  }, [overview]);

  const incomplete = overview
    ? [overview.incomplete.roles && "rollen", overview.incomplete.channels && "kanalen", overview.incomplete.members && "leden"].filter(
        Boolean
      )
    : [];

  return (
    <AppShell user={user}>
      <PageLayout
        title="Permissies"
        subtitle="Alleen-lezen overzicht van de huidige Discord-permissies. Clippy wijzigt niets via dit scherm."
        actions={
          <div className="topBarTabs" role="tablist" aria-label="Permissieweergave">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={`topBarTab ${tab === entry.id ? "topBarTabActive" : ""}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
      >
        {loading && <p className="timetableLoading">Laden…</p>}
        {error && <p className="errorMsg">{error}</p>}
        {!loading && !overview && !error && <p className="cardHint">Geen permissiegegevens beschikbaar.</p>}
        {overview && (
          <>
            <div className="adminStatGrid adminStatGridPrimary">
              <StatCard label="Incorrect" value={overview.counts.error} hint="Duidelijk verkeerde grants" />
              <StatCard label="Controleren" value={overview.counts.warning} hint="Verdacht of onvolledig" />
              <StatCard label="Verwacht" value={overview.counts.expected} hint="Bevestigde policy" />
              <StatCard label="Server" value={overview.guild.name} hint="Live Discord-staat" />
            </div>

            {incomplete.length > 0 && (
              <p className="permissionsBanner permissionsBannerWarn" role="status">
                Discord-fetch was onvolledig voor {incomplete.join(", ")}. Getoonde cache kan verouderd zijn.
              </p>
            )}
            {!overview.bot.resolved && (
              <p className="permissionsBanner permissionsBannerWarn" role="status">
                Clippy kon het botlid niet resolven. Inspectie werkt nog, maar hiërarchie- en
                beheerbaarheidsnotities zijn onvolledig.
              </p>
            )}
            {overview.bot.resolved && overview.bot.limitations.length > 0 && (
              <p className="permissionsBanner permissionsBannerInfo" role="status">
                Hiërarchie: hoogste Clippy-rol is {overview.bot.highestRoleName ?? "onbekend"}.{" "}
                {overview.bot.limitations[0]}
              </p>
            )}

            {tab === "audit" && (
              <AdminSection
                title="Auditbevindingen"
                hint="Zelfde evaluator als /permissions audit. Uitleg waarom iets riskant is, niet alleen de ruwe bitnaam."
              >
                {(["fail", "warn", "ok"] as const).map((severity) => (
                  <PagePanel key={severity}>
                    <div className="permissionsGroupHead">
                      <h3>{SEVERITY_LABEL[severity]}</h3>
                      <span className={`statusBadge statusBadge-${SEVERITY_STATUS[severity]}`}>
                        {grouped[severity].length}
                      </span>
                    </div>
                    <FindingList
                      findings={grouped[severity]}
                      empty={
                        severity === "fail"
                          ? "Geen incorrecte grants."
                          : severity === "warn"
                            ? "Niets om te controleren."
                            : "Geen bevestigde verwachte grants."
                      }
                    />
                  </PagePanel>
                ))}
              </AdminSection>
            )}

            {tab === "roles" && (
              <AdminSection title="Rolinspectie" hint="Serverpermissies en kanaaloverrides staan gescheiden.">
                <PagePanel>
                  <label className="formLabel" htmlFor="permission-role-search">
                    Rol
                  </label>
                  <input
                    id="permission-role-search"
                    className="formInput"
                    placeholder="Zoek op naam of id…"
                    value={roleQuery}
                    onChange={(event) => setRoleQuery(event.target.value)}
                  />
                  <select
                    className="formInput formSelect"
                    value={roleId}
                    onChange={(event) => setRoleId(event.target.value)}
                    aria-label="Rol kiezen"
                  >
                    <option value="">Kies een rol</option>
                    {roles.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} ({KIND_LABEL[entry.kind]})
                      </option>
                    ))}
                  </select>
                  {roles.length === 0 && <p className="cardHint">Geen rollen in deze lijst.</p>}
                </PagePanel>
                {detailLoading && tab === "roles" && <p className="timetableLoading">Rol laden…</p>}
                {detailError && tab === "roles" && <p className="errorMsg">{detailError}</p>}
                {role && (
                  <>
                    <PagePanel>
                      <h3 className="permissionsPanelTitle">{role.name}</h3>
                      <p className="cardHint">
                        {KIND_LABEL[role.kind]} · positie {role.position}
                        {role.managed ? " · beheerd" : ""}
                        {role.manageable === false
                          ? " · Clippy kan deze rol later niet bewerken (hiërarchie). Inspectie blijft mogelijk."
                          : role.manageable
                            ? " · Clippy zou deze rol later kunnen bewerken"
                            : " · beheerbaarheid onbekend"}
                      </p>
                      {role.notes.map((note) => (
                        <p key={note} className="cardHint">
                          {note}
                        </p>
                      ))}
                    </PagePanel>
                    <PagePanel className="permissionsBasePanel">
                      <h3 className="permissionsPanelTitle">Server- / basispermissies</h3>
                      <p className="cardHint">
                        Expliciete rolbits. Pin Messages is {role.pinMessages ? "toegekend" : "niet toegekend"}
                        {role.pinExpected ? " (verwacht door serverpolicy)" : ""}.
                      </p>
                      <PermissionBits entries={role.basePermissions} mode="granted" />
                    </PagePanel>
                    <PagePanel className="permissionsOverridePanel">
                      <h3 className="permissionsPanelTitle">Kanaaloverrides</h3>
                      {role.channelOverrides.length === 0 ? (
                        <p className="cardHint">Geen relevante kanaaloverrides voor deze rol.</p>
                      ) : (
                        <ul className="permissionsOverrideList">
                          {role.channelOverrides.map((entry) => (
                            <li key={entry.channelId}>
                              <strong>#{entry.channelName}</strong>
                              <span> allow {formatKeys(entry.allowKeys)}; deny {formatKeys(entry.denyKeys)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PagePanel>
                  </>
                )}
              </AdminSection>
            )}

            {tab === "channels" && (
              <AdminSection
                title="Kanaal- en categorie-inspectie"
                hint="Overrides, sync-staat en effectieve Clippy-permissies in het gekozen kanaal."
              >
                <PagePanel>
                  <label className="formLabel" htmlFor="permission-channel-search">
                    Kanaal of categorie
                  </label>
                  <input
                    id="permission-channel-search"
                    className="formInput"
                    placeholder="Zoek op naam of id…"
                    value={channelQuery}
                    onChange={(event) => setChannelQuery(event.target.value)}
                  />
                  <select
                    className="formInput formSelect"
                    value={channelId}
                    onChange={(event) => setChannelId(event.target.value)}
                    aria-label="Kanaal kiezen"
                  >
                    <option value="">Kies een kanaal</option>
                    {channels.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.type === "category" ? "" : "#"}
                        {entry.name} ({CHANNEL_TYPE_LABEL[entry.type]}
                        {entry.parentName ? ` · ${entry.parentName}` : ""})
                      </option>
                    ))}
                  </select>
                  {channels.length === 0 && <p className="cardHint">Geen kanalen in deze lijst.</p>}
                </PagePanel>
                {detailLoading && tab === "channels" && <p className="timetableLoading">Kanaal laden…</p>}
                {detailError && tab === "channels" && <p className="errorMsg">{detailError}</p>}
                {channel && (
                  <>
                    <PagePanel>
                      <h3 className="permissionsPanelTitle">{channel.name}</h3>
                      <p className="cardHint">
                        {CHANNEL_TYPE_LABEL[channel.type]} · {SYNC_LABEL[channel.syncState]}
                        {channel.parentName ? ` · categorie ${channel.parentName}` : ""}
                      </p>
                      {channel.notes.map((note) => (
                        <p key={note} className="cardHint">
                          {note}
                        </p>
                      ))}
                    </PagePanel>
                    <PagePanel className="permissionsOverridePanel">
                      <h3 className="permissionsPanelTitle">Relevante overwrites</h3>
                      {channel.overwrites.length === 0 ? (
                        <p className="cardHint">Geen relevante overwrites.</p>
                      ) : (
                        <ul className="permissionsOverrideList">
                          {channel.overwrites.map((entry) => (
                            <li key={`${entry.source}-${entry.type}-${entry.id}`}>
                              <strong>
                                {entry.everyone ? "@everyone" : entry.member ? `lid ${entry.id}` : `@${entry.name}`}
                              </strong>
                              <span>
                                {" "}
                                · {SOURCE_LABEL[entry.source]} · {entry.type === "member" ? "lid" : "rol"} · allow{" "}
                                {formatKeys(entry.allowKeys)}; deny {formatKeys(entry.denyKeys)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PagePanel>
                    <PagePanel>
                      <h3 className="permissionsPanelTitle">Clippy in dit kanaal</h3>
                      {channel.bot.permissions ? (
                        <PermissionBits entries={channel.bot.permissions} mode="allowed" />
                      ) : (
                        <p className="cardHint">Effectieve Clippy-permissies zijn onbekend.</p>
                      )}
                    </PagePanel>
                    <PagePanel>
                      <h3 className="permissionsPanelTitle">Effectieve rolpermissies</h3>
                      <p className="cardHint">
                        Dit is geen volledige matrix van alle serverrollen. Getoond: @everyone, rollen
                        met een overwrite op dit kanaal of de categorie, en extra staffrollen tot een
                        limiet. Discord berekent per rol, niet alsof één rol een lid met meerdere rollen
                        is.
                      </p>
                      {channel.roleEffectiveOmitted > 0 && (
                        <p className="permissionsBanner permissionsBannerWarn" role="status">
                          {channel.roleEffectiveOmitted === 1
                            ? "1 extra staffrol is weggelaten."
                            : `${channel.roleEffectiveOmitted} extra staffrollen zijn weggelaten.`}{" "}
                          Rollen met een expliciete overwrite blijven altijd zichtbaar.
                        </p>
                      )}
                      {channel.roleEffective.length === 0 ? (
                        <p className="cardHint">Geen relevante rollen om te tonen.</p>
                      ) : (
                        <ul className="permissionsOverrideList">
                          {channel.roleEffective.map((entry) => {
                            const allowed = entry.permissions.filter((item) => item.allowed).map((item) => item.label);
                            return (
                              <li key={entry.roleId}>
                                <strong>{entry.roleName}</strong>
                                <span> · {allowed.length ? allowed.join(", ") : "geen relevante bits"}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </PagePanel>
                  </>
                )}
              </AdminSection>
            )}

            {tab === "members" && (
              <AdminSection
                title="Effectieve ledpermissies"
                hint="Echte Discord-permissies van het gekozen lid in het gekozen kanaal, inclusief owner/admin/timeout."
              >
                <PagePanel>
                  <label className="formLabel" htmlFor="permission-member-search">
                    Lid
                  </label>
                  <input
                    id="permission-member-search"
                    className="formInput"
                    placeholder="Zoek op naam…"
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                  />
                  <select
                    className="formInput formSelect"
                    value={memberId}
                    onChange={(event) => setMemberId(event.target.value)}
                    aria-label="Lid kiezen"
                  >
                    <option value="">Kies een lid</option>
                    {members.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.displayName}
                        {entry.username ? ` (@${entry.username})` : ""}
                      </option>
                    ))}
                  </select>
                  {members.length === 0 && (
                    <p className="cardHint">
                      {overview.incomplete.members
                        ? "Ledenlijst is onvolledig; kies een bekend lid als die in de cache zit."
                        : "Geen leden in deze lijst."}
                    </p>
                  )}
                  <label className="formLabel" htmlFor="permission-member-channel">
                    Kanaal
                  </label>
                  <select
                    id="permission-member-channel"
                    className="formInput formSelect"
                    value={memberChannelId}
                    onChange={(event) => setMemberChannelId(event.target.value)}
                  >
                    <option value="">Kies een kanaal</option>
                    {overview.channels
                      .filter((entry) => entry.type !== "category")
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          #{entry.name}
                        </option>
                      ))}
                  </select>
                </PagePanel>
                {detailLoading && tab === "members" && <p className="timetableLoading">Lid laden…</p>}
                {detailError && tab === "members" && <p className="errorMsg">{detailError}</p>}
                {member && (
                  <PagePanel>
                    <h3 className="permissionsPanelTitle">
                      {member.displayName} in #{member.channelName}
                    </h3>
                    <p className="cardHint">
                      Rollen: {member.roles.length ? member.roles.map((entry) => `@${entry.name}`).join(", ") : "alleen @everyone"}
                    </p>
                    {member.notes.map((note) => (
                      <p key={note} className="permissionsBanner permissionsBannerInfo">
                        {note}
                      </p>
                    ))}
                    {member.computed ? (
                      <PermissionBits entries={member.permissions} mode="allowed" />
                    ) : (
                      <p className="cardHint">Effectieve permissies konden niet berekend worden.</p>
                    )}
                  </PagePanel>
                )}
              </AdminSection>
            )}
          </>
        )}
      </PageLayout>
    </AppShell>
  );
}

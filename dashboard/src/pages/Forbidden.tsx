import AppShell from "../components/AppShell";
import PageLayout from "../components/PageLayout";
import PagePanel from "../components/PagePanel";
import type { DiscordUser } from "../types";

export default function Forbidden({ user }: { user: DiscordUser }) {
  return (
    <AppShell user={user}>
      <PageLayout title="Geen toegang" subtitle="Dit onderdeel is alleen voor serverbeheerders">
        <PagePanel className="pagePanelNarrow">
          <p className="cardHint" style={{ margin: 0 }}>
            Je bent aangemeld, maar je Discord-rol heeft geen beheerdersrechten voor dit
            dashboard.
          </p>
        </PagePanel>
      </PageLayout>
    </AppShell>
  );
}

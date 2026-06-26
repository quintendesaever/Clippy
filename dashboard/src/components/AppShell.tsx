import Sidebar from "./Sidebar";
import type { DiscordUser } from "../types";

export default function AppShell({
  user,
  children,
  narrow,
}: {
  user: DiscordUser;
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="appShell">
      <Sidebar user={user} />
      <main className={narrow ? "appMain appMainNarrow" : "appMain"}>{children}</main>
    </div>
  );
}

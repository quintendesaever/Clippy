import Sidebar from "./Sidebar";
import type { DiscordUser } from "../types";

export default function AppShell({
  user,
  children,
}: {
  user: DiscordUser;
  children: React.ReactNode;
}) {
  return (
    <div className="appShell">
      <Sidebar user={user} />
      <div className="appContentColumn">{children}</div>
    </div>
  );
}

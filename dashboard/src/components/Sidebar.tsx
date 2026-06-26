import { Link, useLocation } from "react-router-dom";
import { logout } from "../api";
import type { DiscordUser } from "../types";
import Button from "./Button";
import { UserAvatar } from "./Avatar";

export default function Sidebar({ user }: { user: DiscordUser }) {
  const location = useLocation();

  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  return (
    <aside className="sidebar">
      <div className="sidebarBrand">Clippy</div>
      <nav className="sidebarNav">
        <Link
          to="/timetable"
          className={`sidebarLink ${location.pathname === "/timetable" ? "sidebarLinkActive" : ""}`}
        >
          Rooster
        </Link>
        <Link
          to="/settings"
          className={`sidebarLink ${location.pathname === "/settings" ? "sidebarLinkActive" : ""}`}
        >
          Instellingen
        </Link>
      </nav>
      <div className="sidebarFooter">
        <div className="sidebarUser">
          <UserAvatar userId={user.id} avatar={user.avatar} size="sm" alt={user.username} />
          <span className="sidebarUsername">@{user.username}</span>
        </div>
        <Button variant="secondary" size="small" block onClick={handleLogout}>
          Uitloggen
        </Button>
      </div>
    </aside>
  );
}

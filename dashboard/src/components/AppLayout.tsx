import { Link, useLocation } from "react-router-dom";
import { logout } from "../api";
import type { DiscordUser } from "../types";

export default function AppLayout({
  user,
  children,
  wide,
}: {
  user: DiscordUser;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const location = useLocation();

  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  return (
    <div className="app">
      <header className="appHeader">
        <span className="appTitle">Clippy</span>
        <nav className="appNav">
          <Link
            to="/timetable"
            className={`appNavLink ${location.pathname === "/timetable" ? "appNavLinkActive" : ""}`}
          >
            Rooster
          </Link>
          <Link
            to="/settings"
            className={`appNavLink ${location.pathname === "/settings" ? "appNavLinkActive" : ""}`}
          >
            Instellingen
          </Link>
        </nav>
        <span className="userLabel">@{user.username}</span>
        <button type="button" className="btn btnSecondary" onClick={handleLogout}>
          Uitloggen
        </button>
      </header>
      <main className={wide ? "main mainWide" : "main"}>{children}</main>
    </div>
  );
}

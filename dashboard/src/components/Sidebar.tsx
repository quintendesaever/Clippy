import { Link, useLocation } from "react-router-dom";
import { logout } from "../api";
import type { DiscordUser } from "../types";
import { UserAvatar } from "./Avatar";

function CalendarIcon() {
  return (
    <svg className="sidebarNavIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm11 7H3v7h14V9Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="sidebarNavIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.212l-1.273 1.273a7.002 7.002 0 0 1 0 2.828l1.273 1.273a1 1 0 0 1 .205 1.212l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.331 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.212l1.273-1.273a7.002 7.002 0 0 1 0-2.828L2.205 7.03a1 1 0 0 1-.205-1.212l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.997 6.997 0 0 1 7.84 1.804ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="sidebarNavIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 14.5a4 4 0 0 1 8 0v.25A1.25 1.25 0 0 1 12.75 16h-5.5A1.25 1.25 0 0 1 6 14.75V14.5Z" />
    </svg>
  );
}

function LogoIcon() {
  return (
    <svg className="sidebarLogoIcon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 3a2 2 0 0 0-2 2v14l7-3.5L20 19V5a2 2 0 0 0-2-2H8Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="sidebarLogoutIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z"
        clipRule="evenodd"
      />
      <path
        fillRule="evenodd"
        d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function Sidebar({ user }: { user: DiscordUser }) {
  const location = useLocation();
  const displayName = user.nickname ?? user.username;

  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  return (
    <aside className="sidebar">
      <div className="sidebarBrand">
        <LogoIcon />
        <span>Clippy</span>
      </div>

      <nav className="sidebarNav">
        <p className="sidebarSectionLabel">Algemeen</p>
        <Link
          to="/timetable"
          className={`sidebarLink ${location.pathname === "/timetable" ? "sidebarLinkActive" : ""}`}
        >
          <CalendarIcon />
          <span className="sidebarLinkLabel">Rooster</span>
        </Link>
        <Link
          to="/my-timetable"
          className={`sidebarLink ${location.pathname === "/my-timetable" ? "sidebarLinkActive" : ""}`}
        >
          <UserIcon />
          <span className="sidebarLinkLabel">Mijn rooster</span>
        </Link>
        <Link
          to="/settings"
          className={`sidebarLink ${location.pathname === "/settings" ? "sidebarLinkActive" : ""}`}
        >
          <SettingsIcon />
          <span className="sidebarLinkLabel">Instellingen</span>
        </Link>
      </nav>

      <div className="sidebarFooter">
        <div className="sidebarProfileCard">
          <UserAvatar userId={user.id} avatar={user.avatar} size="sm" alt={displayName} />
          <div className="sidebarProfileInfo">
            <span className="sidebarProfileName">{displayName}</span>
            <span className="sidebarProfileHandle">@{user.username}</span>
          </div>
          <button
            type="button"
            className="sidebarLogout"
            onClick={handleLogout}
            aria-label="Uitloggen"
            title="Uitloggen"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}

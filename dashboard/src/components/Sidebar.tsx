import { Link, useLocation } from "react-router-dom";
import { logout } from "../api";
import { usePreferences } from "../hooks/usePreferences";
import type { DiscordUser } from "../types";
import { UserAvatar } from "./Avatar";
import clippyLogo from "../assets/logoicon_clippy_01@2x.png";

function CalendarIcon() {
  return (
    <svg className="sidebarNavIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm11 7H3v7h14V9Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="sidebarNavIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3 3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14a1 1 0 1 0 0-2H4V4a1 1 0 0 0-1-1Zm4 8a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Zm4-3a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm4-4a1 1 0 0 1 1 1v9a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="sidebarNavIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M16.5 4.2c-1.3-.6-2.7-1-4.2-1.2-.2.3-.4.7-.5 1-1.5-.2-3.1-.2-4.6 0-.2-.3-.4-.7-.6-1-1.5.2-2.9.6-4.2 1.2C.8 7.5.3 10.7.5 13.8c1.7 1.3 3.4 2 5 2.4.4-.6.8-1.2 1.1-1.8-.6-.2-1.2-.5-1.7-.8.1-.1.3-.2.4-.3 3.4 1.6 7.1 1.6 10.4 0 .2.1.3.2.4.3-.6.3-1.1.6-1.7.8.3.6.7 1.2 1.1 1.8 1.7-.4 3.3-1.1 5-2.4.3-3.6-.5-6.8-2-9.6ZM6.9 12.3c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9 1 1.9 2-.8 2-1.9 2Zm6.2 0c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9 1 1.9 2-.9 2-1.9 2Z" />
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
    <img className="sidebarLogoIcon" src={clippyLogo} alt="" width={28} height={28} />
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
  const { isAdmin } = usePreferences();
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
        {isAdmin && (
          <>
            <Link
              to="/admin"
              className={`sidebarLink ${location.pathname === "/admin" ? "sidebarLinkActive" : ""}`}
            >
              <ChartIcon />
              <span className="sidebarLinkLabel">Beheer</span>
            </Link>
            <Link
              to="/admin/discord"
              className={`sidebarLink ${location.pathname === "/admin/discord" ? "sidebarLinkActive" : ""}`}
            >
              <DiscordIcon />
              <span className="sidebarLinkLabel">Discord</span>
            </Link>
          </>
        )}
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

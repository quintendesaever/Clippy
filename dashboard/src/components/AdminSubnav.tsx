import { Link, useLocation } from "react-router-dom";

const ADMIN_TABS = [
  { to: "/admin", label: "Overzicht", match: (path: string) => path === "/admin" },
  {
    to: "/admin/discord",
    label: "Discord",
    match: (path: string) => path === "/admin/discord",
  },
  {
    to: "/admin/status",
    label: "Status",
    match: (path: string) => path === "/admin/status",
  },
] as const;

export default function AdminSubnav() {
  const { pathname } = useLocation();

  return (
    <nav className="adminSubnav" aria-label="Beheeronderdelen">
      {ADMIN_TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`adminSubnavLink${active ? " adminSubnavLinkActive" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

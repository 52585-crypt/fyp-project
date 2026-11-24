import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "./Icon";
import { Avatar } from "./ui";
import { useTheme } from "../lib/theme";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/providers", label: "Provider verification", icon: "shield" },
  { to: "/requests", label: "Service requests", icon: "requests" },
  { to: "/users", label: "Users & providers", icon: "users" }
];

export function Layout() {
  const { admin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { isDark, toggle } = useTheme();

  // Close the mobile menu after navigating (state adjusted during render, no effect needed).
  const [menuPath, setMenuPath] = useState(location.pathname);
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname);
    setMenuOpen(false);
  }

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="car" size={18} />
          </span>
          <div>
            <div className="brand-name">RapidAssist</div>
            <div className="brand-tag">Admin console</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="admin-chip">
            <Avatar name={admin?.name} size={34} />
            <div className="admin-chip-text">
              <div className="admin-chip-name">{admin?.name}</div>
              <div className="admin-chip-meta">{admin?.phone}</div>
            </div>
          </div>
          <div className="sidebar-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}>
              <Icon name={isDark ? "sun" : "moon"} size={16} />
              <span>{isDark ? "Light" : "Dark"}</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              <Icon name="logout" size={16} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="main-wrap">
        <header className="mobile-bar">
          <button type="button" className="icon-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="brand-name">RapidAssist Admin</span>
          <Avatar name={admin?.name} size={30} />
        </header>
        <main id="main" className="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../auth/AdminAuth";
import { useState } from "react";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" /></svg>
      </span>
      <span>RapidAssist<small>OPERATIONS WORKSPACE</small></span>
    </div>
  );
}

export function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function onLogout() {
    if (signingOut) return;
    try {
      setSigningOut(true); setLogoutError("");
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message || "Unable to sign out. Please try again.");
    } finally { setSigningOut(false); }
  }
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Brand />
        <div className="nav-caption">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink to="/dashboard"><span aria-hidden="true">▦</span> Overview</NavLink>
          <NavLink to="/providers"><span aria-hidden="true">◎</span> Provider verification</NavLink>
          <NavLink to="/live-jobs"><span aria-hidden="true">⌖</span> Live jobs map</NavLink>
        </nav>
        <div className="sidebar-note"><span className="note-icon" aria-hidden="true">↗</span><strong>Keep people moving.</strong><p>Manage the people and services behind every roadside rescue.</p></div>
        <div className="sidebar-footer"><span className="admin-avatar">RA</span><div><strong>{admin?.name || "Admin workspace"}</strong><small>{admin?.email || "RapidAssist operations"}</small></div></div>
        {logoutError ? <p role="alert">{logoutError}</p> : null}
        <button className="sidebar-logout" type="button" disabled={signingOut} onClick={onLogout}>{signingOut ? "Signing out…" : "Sign out"}</button>
      </aside>
      <main className="admin-content" id="main-content"><Outlet /></main>
    </div>
  );
}

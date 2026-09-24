import { useMemo, useState } from "react";
import { adminApi } from "../config/api";
import { Brand } from "../components/AdminLayout";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => email.trim().length > 3 && password.length >= 6, [email, password]);

  async function onSubmit(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      // Existing placeholder flow: real admin authentication is still pending.
      await adminApi.get("/health");
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="RapidAssist">
        <Brand />
        <div>
          <div className="story-label">EVERY JOURNEY MATTERS</div>
          <h1>A little help.<br /><span>A long way forward.</span></h1>
          <p>Bring providers, people, and roadside support together. Your operations start here.</p>
        </div>
        <div className="story-footer">Towing · Fuel delivery · Mechanic assistance</div>
      </section>
      <section className="login-form-side">
        <div className="login-card">
          <div className="page-eyebrow">ADMIN WORKSPACE</div>
          <h2>Welcome back.</h2>
          <p>Sign in to manage your roadside operations.</p>
          <form onSubmit={onSubmit}>
            <label htmlFor="admin-email">Email address</label>
            <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@rapidassist.pk" />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
            {error ? <div role="alert" className="login-error">{error}</div> : null}
            <button className="login-submit" type="submit" disabled={!canSubmit || loading}>
              {loading ? "Connecting…" : "Sign in to workspace"}<span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="login-footnote">RapidAssist · Administration</p>
        </div>
      </section>
    </main>
  );
}

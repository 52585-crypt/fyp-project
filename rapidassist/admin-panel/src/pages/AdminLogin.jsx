import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiErrorMessage } from "../config/api";
import { Icon } from "../components/Icon";
import { Button, FullPageLoader } from "../components/ui";
import { useDocumentTitle } from "../lib/hooks";

export function AdminLogin() {
  useDocumentTitle("Sign in");
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const redirectTo = location.state?.from || "/dashboard";

  if (status === "checking") return <FullPageLoader label="Checking your session…" />;
  if (status === "authenticated") return <Navigate to={redirectTo} replace />;

  const canSubmit = phone.trim().length >= 10 && password.length >= 6 && !loading;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      await login(phone.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Sign in failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-aside" aria-hidden="true">
        <div className="brand brand-light">
          <span className="brand-mark">
            <Icon name="car" size={18} />
          </span>
          <div>
            <div className="brand-name">RapidAssist</div>
            <div className="brand-tag">Admin console</div>
          </div>
        </div>
        <div className="login-pitch">
          <h2>Keep roadside help safe and moving.</h2>
          <ul>
            <li><Icon name="shield" /> Verify provider identity documents</li>
            <li><Icon name="activity" /> Watch live requests and step in when needed</li>
            <li><Icon name="users" /> Suspend accounts that break the rules</li>
          </ul>
        </div>
      </div>

      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit} noValidate>
          <h1 className="login-title">Sign in</h1>
          <p className="muted">Use your RapidAssist admin phone number and password.</p>

          {error ? (
            <div className="banner banner-danger" role="alert">
              <Icon name="alert" />
              <span className="banner-text">{error}</span>
            </div>
          ) : null}

          <label className="field">
            <span className="field-label">Phone number</span>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03001234567"
              inputMode="tel"
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="input-with-action">
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
              />
              <button type="button" className="input-action" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <Button type="submit" variant="primary" className="btn-block" loading={loading} disabled={!canSubmit}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <p className="login-help muted">
            No admin account yet? Run <code>npm run create-admin</code> in the server folder.
          </p>
        </form>
      </main>
    </div>
  );
}

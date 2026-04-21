import React, { useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:4000";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length >= 6, [email, password]);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      // Placeholder: will be wired to real admin auth endpoint in backend V1.5 / V5
      await axios.get(`${API_BASE_URL}/health`);

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.logo} />
          <div>
            <div style={styles.brand}>RapidAssist</div>
            <div style={styles.tagline}>Admin Panel</div>
          </div>
        </div>

        <h1 style={styles.title}>Sign in</h1>
        <p style={styles.subtitle}>Manage users, mechanics, complaints and requests.</p>

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label style={styles.label}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@rapidassist.pk"
            style={styles.input}
          />

          <div style={{ height: 10 }} />
          <label style={styles.label}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            style={styles.input}
          />

          {error ? <div style={styles.error}>{error}</div> : null}

          <button type="submit" disabled={!canSubmit || loading} style={{ ...styles.button, opacity: !canSubmit || loading ? 0.6 : 1 }}>
            {loading ? "Please wait..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "var(--bg)"
  },
  card: {
    width: "100%",
    maxWidth: 440,
    border: "1px solid var(--border)",
    borderRadius: 18,
    boxShadow: "var(--shadow)",
    background: "white",
    padding: 18
  },
  brandRow: { display: "flex", gap: 12, alignItems: "center" },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "var(--primary)"
  },
  brand: { fontWeight: 900, color: "var(--text)", fontSize: 18 },
  tagline: { color: "var(--muted)", fontSize: 12 },
  title: { margin: "16px 0 0", fontSize: 28, fontWeight: 900, color: "var(--text)" },
  subtitle: { margin: "8px 0 0", color: "var(--muted)" },
  label: { display: "block", marginTop: 12, marginBottom: 6, color: "var(--muted)", fontSize: 12, fontWeight: 800 },
  input: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    padding: "0 12px",
    outline: "none",
    fontSize: 14
  },
  button: {
    marginTop: 14,
    width: "100%",
    height: 46,
    border: 0,
    borderRadius: 14,
    background: "var(--primary)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer"
  },
  error: { marginTop: 10, color: "var(--danger)", fontSize: 13, fontWeight: 700 }
};


import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:4000";

export function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadDashboard() {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/admin/dashboard`);
        if (mounted) setData(res.data);
      } catch (err) {
        if (mounted) setError(err?.response?.data?.message || err?.message || "Failed to load dashboard");
      }
    }

    loadDashboard();
    const timer = setInterval(loadDashboard, 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const stats = data?.stats || {};

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.title}>Dashboard</div>
          <div style={styles.subtitle}>RapidAssist admin overview</div>
        </div>
        <a href="/login" style={styles.link}>
          Logout
        </a>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.grid}>
        <StatCard title="Users" value={stats.users ?? "0"} />
        <StatCard title="Providers" value={stats.providers ?? "0"} />
        <StatCard title="Active Requests" value={stats.activeRequests ?? "0"} />
        <StatCard title="Pending Providers" value={stats.pendingProviders ?? "0"} />
        <StatCard title="Completed" value={stats.completedRequests ?? "0"} />
        <StatCard title="Cancelled" value={stats.cancelledRequests ?? "0"} />
        <StatCard title="Today Requests" value={stats.todayRequests ?? "0"} />
        <StatCard title="Revenue" value={`PKR ${(stats.revenue ?? 0).toLocaleString()}`} />
      </div>

      <div style={styles.tableCard}>
        <div style={styles.tableTitle}>Recent requests</div>
        {(data?.recentRequests || []).length === 0 ? (
          <div style={styles.empty}>No requests yet.</div>
        ) : (
          <div style={styles.table}>
            {(data?.recentRequests || []).map((request) => (
              <div key={request.id} style={styles.row}>
                <div>
                  <div style={styles.requestTitle}>{request.category.replaceAll("_", " ")}</div>
                  <div style={styles.requestMeta}>{request.user?.name || "Unknown user"} - {request.pickupLocation?.addressText || "No location"}</div>
                </div>
                <div style={styles.status}>{request.status.replaceAll("_", " ")}</div>
                <div style={styles.amount}>PKR {(request.estimate?.total || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardValue}>{value}</div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: 18, background: "var(--bg)" },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 16,
    background: "white",
    boxShadow: "var(--shadow)"
  },
  title: { fontSize: 22, fontWeight: 900, color: "var(--text)" },
  subtitle: { marginTop: 4, color: "var(--muted)" },
  link: { color: "var(--primary)", fontWeight: 900 },
  error: {
    marginTop: 14,
    border: "1px solid #fecaca",
    borderRadius: 14,
    background: "#fee2e2",
    color: "#b91c1c",
    padding: 12,
    fontWeight: 800
  },
  grid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  card: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 16,
    background: "var(--surface)"
  },
  cardTitle: { color: "var(--muted)", fontWeight: 900, fontSize: 12 },
  cardValue: { marginTop: 10, fontSize: 26, fontWeight: 900, color: "var(--text)" },
  tableCard: {
    marginTop: 16,
    border: "1px solid var(--border)",
    borderRadius: 18,
    background: "white",
    padding: 16
  },
  tableTitle: { color: "var(--text)", fontSize: 18, fontWeight: 900 },
  empty: { marginTop: 12, color: "var(--muted)", fontWeight: 700 },
  table: { marginTop: 12, display: "grid", gap: 10 },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 180px 140px",
    gap: 12,
    alignItems: "center",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 12,
    background: "var(--surface)"
  },
  requestTitle: { textTransform: "capitalize", color: "var(--text)", fontWeight: 900 },
  requestMeta: { marginTop: 3, color: "var(--muted)", fontSize: 12 },
  status: { textTransform: "capitalize", color: "var(--primary)", fontWeight: 900 },
  amount: { color: "var(--text)", fontWeight: 900, textAlign: "right" }
};


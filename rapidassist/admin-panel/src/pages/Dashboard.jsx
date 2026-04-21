import React from "react";

export function Dashboard() {
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

      <div style={styles.grid}>
        <StatCard title="Users" value="—" />
        <StatCard title="Mechanics" value="—" />
        <StatCard title="Active Requests" value="—" />
        <StatCard title="Complaints" value="—" />
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
  grid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  card: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 16,
    background: "var(--surface)"
  },
  cardTitle: { color: "var(--muted)", fontWeight: 900, fontSize: 12 },
  cardValue: { marginTop: 10, fontSize: 26, fontWeight: 900, color: "var(--text)" }
};


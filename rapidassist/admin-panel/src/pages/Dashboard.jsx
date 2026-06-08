import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config/api";

const refreshMs = 15000;

function serviceTitle(category) {
  if (category === "car_towing") return "Car Towing";
  if (category === "fuel_delivery") return "Fuel Delivery";
  if (category === "mechanic") return "Mechanic Service";
  return "Unknown";
}

function statusLabel(status) {
  return String(status || "unknown").replaceAll("_", " ");
}

function statusTone(status) {
  if (status === "completed" || status === "verified") return { background: "#dcfce7", color: "#166534" };
  if (status === "cancelled" || status === "rejected") return { background: "#fee2e2", color: "#991b1b" };
  if (status === "pending" || status === "searching_provider") return { background: "#fef3c7", color: "#92400e" };
  return { background: "#dbeafe", color: "#1d4ed8" };
}

function formatCurrency(value) {
  return `PKR ${Number(value || 0).toLocaleString()}`;
}

function formatDateTime(value) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`${API_BASE_URL}/api/admin/dashboard`);
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function loadWhenMounted() {
      if (mounted) await loadDashboard();
    }

    loadWhenMounted();
    const timer = setInterval(loadWhenMounted, refreshMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const stats = data?.stats || {};
  const categoryBreakdown = data?.breakdowns?.byCategory || {};
  const statusBreakdown = data?.breakdowns?.byStatus || {};
  const totalRequests = useMemo(
    () => (stats.activeRequests || 0) + (stats.completedRequests || 0) + (stats.cancelledRequests || 0),
    [stats.activeRequests, stats.cancelledRequests, stats.completedRequests]
  );
  const completionRate = totalRequests ? Math.round(((stats.completedRequests || 0) / totalRequests) * 100) : 0;
  const averageJobValue = stats.completedRequests ? Math.round((stats.revenue || 0) / stats.completedRequests) : 0;
  const providerReadiness = stats.providers ? Math.round(((stats.onlineProviders || 0) / stats.providers) * 100) : 0;

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.title}>Admin Dashboard</div>
          <div style={styles.subtitle}>
            RapidAssist operations overview{lastUpdated ? ` - updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
          <div style={styles.apiMeta}>API: {API_BASE_URL}</div>
        </div>
        <div style={styles.nav}>
          <button type="button" onClick={loadDashboard} style={styles.refreshButton}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <Link to="/providers" style={styles.link}>Provider Verification</Link>
          <Link to="/login" style={styles.link}>Logout</Link>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {!error && (stats.pendingProviders > 0 || stats.activeRequests > 0) ? (
        <div style={styles.alert}>
          <div>
            <div style={styles.alertTitle}>Action needed</div>
            <div style={styles.alertText}>
              {stats.pendingProviders || 0} provider reviews pending and {stats.activeRequests || 0} requests active.
            </div>
          </div>
          <Link to="/providers" style={styles.alertLink}>Open provider queue</Link>
        </div>
      ) : null}

      <div style={styles.heroGrid}>
        <div style={styles.heroPanel}>
          <div style={styles.eyebrow}>Request volume</div>
          <div style={styles.heroValue}>{totalRequests.toLocaleString()}</div>
          <div style={styles.heroMeta}>{stats.todayRequests || 0} new today</div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${completionRate}%`
              }}
            />
          </div>
          <div style={styles.heroFoot}>{stats.completedRequests || 0} completed jobs - {completionRate}% completion rate</div>
        </div>

        <ActionCard
          title="Pending providers"
          value={stats.pendingProviders || 0}
          text="Review uploaded identity and service documents."
          href="/providers"
          tone="warning"
        />
        <ActionCard
          title="Online providers"
          value={stats.onlineProviders || 0}
          text={`${providerReadiness}% of providers are currently available.`}
          tone="success"
        />
        <ActionCard
          title="Revenue"
          value={formatCurrency(stats.revenue)}
          text={`${formatCurrency(averageJobValue)} average completed job value.`}
          tone="primary"
        />
        <ActionCard
          title="Average rating"
          value={stats.averageRating ? `${Number(stats.averageRating).toFixed(1)} / 5` : "No reviews"}
          text={`${stats.reviewedRequests || 0} completed jobs reviewed by users.`}
          tone="success"
        />
      </div>

      <div style={styles.grid}>
        <StatCard title="Users" value={stats.users ?? 0} />
        <StatCard title="Providers" value={stats.providers ?? 0} />
        <StatCard title="Vehicles" value={stats.vehicles ?? 0} />
        <StatCard title="Active Requests" value={stats.activeRequests ?? 0} />
        <StatCard title="Completed" value={stats.completedRequests ?? 0} />
        <StatCard title="Cancelled" value={stats.cancelledRequests ?? 0} />
        <StatCard title="Today Requests" value={stats.todayRequests ?? 0} />
        <StatCard title="Complaints" value={stats.complaints ?? 0} />
        <StatCard title="Reviews" value={stats.reviewedRequests ?? 0} />
      </div>

      <div style={styles.twoColumn}>
        <Panel title="Requests by service">
          <BreakdownRow label="Car Towing" value={categoryBreakdown.car_towing || 0} total={totalRequests} />
          <BreakdownRow label="Fuel Delivery" value={categoryBreakdown.fuel_delivery || 0} total={totalRequests} />
          <BreakdownRow label="Mechanic Service" value={categoryBreakdown.mechanic || 0} total={totalRequests} />
        </Panel>

        <Panel title="Request status">
          {Object.entries(statusBreakdown)
            .filter(([, value]) => value > 0)
            .map(([status, value]) => (
              <BreakdownRow key={status} label={statusLabel(status)} value={value} total={totalRequests} />
            ))}
          {Object.values(statusBreakdown).every((value) => value === 0) ? <div style={styles.emptySmall}>No request data yet.</div> : null}
        </Panel>
      </div>

      <div style={styles.twoColumnWide}>
        <Panel
          title="Pending provider queue"
          action={<Link to="/providers" style={styles.smallLink}>Review all</Link>}
        >
          {(data?.pendingProvidersList || []).length === 0 ? (
            <div style={styles.emptySmall}>No pending providers.</div>
          ) : (
            <div style={styles.stack}>
              {(data?.pendingProvidersList || []).map((provider) => (
                <Link key={provider.id} to="/providers" style={styles.providerRow}>
                  <div>
                    <div style={styles.rowTitle}>{provider.name}</div>
                    <div style={styles.rowMeta}>{serviceTitle(provider.mechanicProfile?.serviceCategory)} - {provider.phone}</div>
                    <div style={styles.rowMeta}>Joined: {formatDateTime(provider.createdAt)}</div>
                  </div>
                  <span style={{ ...styles.badge, ...statusTone(provider.verificationStatus) }}>{provider.verificationStatus}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent requests">
          {(data?.recentRequests || []).length === 0 ? (
            <div style={styles.emptySmall}>No requests yet.</div>
          ) : (
            <div style={styles.stack}>
              {(data?.recentRequests || []).map((request) => (
                <div key={request.id} style={styles.requestRow}>
                  <div>
                    <div style={styles.rowTitle}>{serviceTitle(request.category)}</div>
                    <div style={styles.rowMeta}>
                      {request.user?.name || "Unknown user"} - {request.pickupLocation?.addressText || "No location"}
                    </div>
                    <div style={styles.rowMeta}>
                      Provider: {request.provider?.name || "Not assigned"}
                    </div>
                    {request.review?.rating ? (
                      <div style={styles.rowMeta}>
                        Rating: {request.review.rating}/5{request.review.comment ? ` - ${request.review.comment}` : ""}
                      </div>
                    ) : null}
                    <div style={styles.rowMeta}>Created: {formatDateTime(request.createdAt)}</div>
                  </div>
                  <span style={{ ...styles.badge, ...statusTone(request.status) }}>{statusLabel(request.status)}</span>
                  <div style={styles.amount}>{formatCurrency(request.estimate?.total)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ActionCard({ title, value, text, href, tone }) {
  const toneStyle = tone === "warning" ? styles.warningCard : tone === "success" ? styles.successCard : styles.primaryCard;
  const content = (
    <>
      <div style={styles.actionTitle}>{title}</div>
      <div style={styles.actionValue}>{value}</div>
      <div style={styles.actionText}>{text}</div>
    </>
  );

  return href ? (
    <Link to={href} style={{ ...styles.actionCard, ...toneStyle }}>
      {content}
    </Link>
  ) : (
    <div style={{ ...styles.actionCard, ...toneStyle }}>
      {content}
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardValue}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>{title}</div>
        {action}
      </div>
      <div style={styles.panelBody}>{children}</div>
    </div>
  );
}

function BreakdownRow({ label, value, total }) {
  const pct = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div style={styles.breakdownRow}>
      <div style={styles.breakdownTop}>
        <span style={styles.breakdownLabel}>{label}</span>
        <span style={styles.breakdownValue}>{value.toLocaleString()} - {Math.round(pct)}%</span>
      </div>
      <div style={styles.breakdownTrack}>
        <div style={{ ...styles.breakdownFill, width: `${pct}%` }} />
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: 18, background: "var(--bg)" },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 16,
    background: "white",
    boxShadow: "var(--shadow)"
  },
  title: { fontSize: 22, fontWeight: 900, color: "var(--text)" },
  subtitle: { marginTop: 4, color: "var(--muted)", fontSize: 13 },
  apiMeta: { marginTop: 4, color: "var(--muted)", fontSize: 11, fontWeight: 800 },
  nav: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  link: { color: "var(--primary)", fontWeight: 900 },
  smallLink: { color: "var(--primary)", fontSize: 12, fontWeight: 900 },
  refreshButton: {
    height: 38,
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--surface)",
    color: "var(--text)",
    padding: "0 14px",
    fontWeight: 900,
    cursor: "pointer"
  },
  error: {
    marginTop: 14,
    border: "1px solid #fecaca",
    borderRadius: 14,
    background: "#fee2e2",
    color: "#b91c1c",
    padding: 12,
    fontWeight: 800
  },
  alert: {
    marginTop: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid #fde68a",
    borderRadius: 16,
    background: "#fffbeb",
    padding: 14
  },
  alertTitle: { color: "#92400e", fontSize: 14, fontWeight: 900 },
  alertText: { marginTop: 3, color: "#92400e", fontSize: 12, fontWeight: 700 },
  alertLink: { color: "#92400e", fontSize: 12, fontWeight: 900 },
  heroGrid: { marginTop: 16, display: "grid", gridTemplateColumns: "2fr repeat(4, minmax(0, 1fr))", gap: 12 },
  heroPanel: { border: "1px solid var(--border)", borderRadius: 18, padding: 18, background: "#111827", color: "white" },
  eyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 900 },
  heroValue: { marginTop: 8, fontSize: 38, fontWeight: 900 },
  heroMeta: { marginTop: 4, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 800 },
  progressTrack: { marginTop: 18, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.18)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, background: "var(--primary)" },
  heroFoot: { marginTop: 10, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 800 },
  actionCard: { border: "1px solid var(--border)", borderRadius: 18, padding: 16, background: "white" },
  warningCard: { background: "#fffbeb", borderColor: "#fde68a" },
  successCard: { background: "#f0fdf4", borderColor: "#bbf7d0" },
  primaryCard: { background: "#eff6ff", borderColor: "#bfdbfe" },
  actionTitle: { color: "var(--muted)", fontSize: 12, fontWeight: 900 },
  actionValue: { marginTop: 10, color: "var(--text)", fontSize: 28, fontWeight: 900 },
  actionText: { marginTop: 8, color: "var(--muted)", fontSize: 12, fontWeight: 700, lineHeight: 1.45 },
  grid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  card: { border: "1px solid var(--border)", borderRadius: 16, padding: 14, background: "var(--surface)" },
  cardTitle: { color: "var(--muted)", fontWeight: 900, fontSize: 12 },
  cardValue: { marginTop: 8, fontSize: 24, fontWeight: 900, color: "var(--text)" },
  twoColumn: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  twoColumnWide: { marginTop: 16, display: "grid", gridTemplateColumns: "0.85fr 1.35fr", gap: 16, alignItems: "start" },
  panel: { border: "1px solid var(--border)", borderRadius: 18, background: "white", padding: 16, boxShadow: "var(--shadow)" },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  panelTitle: { color: "var(--text)", fontSize: 17, fontWeight: 900 },
  panelBody: { marginTop: 12 },
  breakdownRow: { display: "grid", gap: 7, marginBottom: 12 },
  breakdownTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  breakdownLabel: { color: "var(--text)", fontSize: 13, fontWeight: 900, textTransform: "capitalize" },
  breakdownValue: { color: "var(--muted)", fontSize: 12, fontWeight: 900 },
  breakdownTrack: { height: 9, borderRadius: 999, background: "var(--surface)", overflow: "hidden" },
  breakdownFill: { height: "100%", borderRadius: 999, background: "var(--primary)" },
  stack: { display: "grid", gap: 10 },
  providerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "var(--surface)",
    padding: 12
  },
  requestRow: {
    display: "grid",
    gridTemplateColumns: "1fr 150px 130px",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "var(--surface)",
    padding: 12
  },
  rowTitle: { color: "var(--text)", fontSize: 14, fontWeight: 900 },
  rowMeta: { marginTop: 3, color: "var(--muted)", fontSize: 12, fontWeight: 700 },
  badge: { justifySelf: "start", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900, textTransform: "capitalize" },
  amount: { color: "var(--text)", fontWeight: 900, textAlign: "right" },
  emptySmall: { color: "var(--muted)", fontSize: 13, fontWeight: 800 }
};

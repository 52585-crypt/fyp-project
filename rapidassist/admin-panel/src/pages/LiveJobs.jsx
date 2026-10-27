import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { adminApi, API_BASE_URL } from "../config/api";
import { LiveJobsMap } from "../components/LiveJobsMap";

const statusText = (value) => String(value || "").replaceAll("_", " ");
const locationAge = (value) => {
  if (!value) return "No live location";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  return seconds > 60 ? `${Math.floor(seconds / 60)} min old` : `${seconds}s old`;
};

export function LiveJobs() {
  const [jobs, setJobs] = useState([]);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  const load = useCallback(async () => {
    try { const response = await adminApi.get("/api/admin/active-jobs"); setJobs(response.data.jobs); setAnalytics(response.data.matchingAnalytics); setError(""); }
    catch (e) { setError(e?.response?.data?.message || e?.message || "Unable to load active jobs"); }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, 15000);
    const socket = io(API_BASE_URL, { withCredentials: true, transports: ["websocket"] });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("request:changed", () => void load());
    return () => { clearTimeout(initial); clearInterval(timer); socket.disconnect(); };
  }, [load]);

  const filtered = useMemo(() => jobs.filter((job) => (category === "all" || job.category === category) && (status === "all" || job.status === status)), [category, jobs, status]);
  const selected = filtered.find((job) => job.id === selectedId) || filtered[0] || null;
  const statuses = [...new Set(jobs.map((job) => job.status))];

  return <div style={styles.page}>
    <div className="page-topbar"><div><div className="page-eyebrow">LIVE OPERATIONS</div><h1 style={styles.title}>Active jobs map</h1><div style={styles.meta}>{connected ? "Live socket connected" : "Reconnecting · 15 second fallback refresh"}</div></div><button style={styles.button} onClick={() => void load()}>Refresh</button></div>
    {error ? <div style={styles.error}>{error}</div> : null}
    <div style={styles.filters}>
      <select value={category} onChange={(event) => setCategory(event.target.value)} style={styles.select}><option value="all">All services</option><option value="car_towing">Car towing</option><option value="fuel_delivery">Fuel delivery</option><option value="mechanic">Mechanic</option></select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} style={styles.select}><option value="all">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{statusText(item)}</option>)}</select>
      <strong>{filtered.length} active jobs</strong>
    </div>
    {analytics ? <div style={styles.analytics}>
      <Metric label="Algorithm" value={analytics.algorithmVersion} />
      <Metric label="Acceptance" value={`${analytics.acceptanceRate}%`} />
      <Metric label="Avg response" value={`${analytics.averageAcceptedResponseSeconds}s`} />
      <Metric label="Avg travel ETA" value={`${analytics.averageTravelDurationMinutes} min`} />
      <Metric label="Weighted distance" value={`${analytics.averageSelectedDistanceKm} km`} />
      <Metric label="Nearest baseline" value={`${analytics.averageNearestBaselineKm} km`} />
    </div> : null}
    <div style={styles.layout}>
      <LiveJobsMap jobs={filtered} onSelect={setSelectedId} />
      <aside style={styles.detail}>{selected ? <>
        <div style={styles.eyebrow}>{statusText(selected.category)}</div><h2 style={styles.name}>{selected.customer?.name || "Customer"}</h2>
        <span style={styles.pill}>{statusText(selected.status)}</span>
        <dl style={styles.list}><dt>Pickup</dt><dd>{selected.pickupLocation?.addressText || `${selected.pickupLocation?.lat}, ${selected.pickupLocation?.lng}`}</dd><dt>Priority</dt><dd>{statusText(selected.priority || "normal")}</dd><dt>Provider</dt><dd>{selected.provider?.name || "Searching"}</dd><dt>Provider GPS</dt><dd>{locationAge(selected.provider?.location?.receivedAt || selected.provider?.location?.updatedAt)}</dd><dt>Estimate</dt><dd>PKR {Number(selected.estimate?.total || 0).toLocaleString()}</dd></dl>
        {selected.matchingDecision ? <div style={styles.decision}><strong>Smart match · {selected.matchingDecision.score}/100</strong><p>{selected.matchingDecision.explanation}</p><small>{selected.matchingDecision.travelDurationMinutes ? `${selected.matchingDecision.travelDurationMinutes} min · ` : ""}{selected.matchingDecision.distanceKm} km · {selected.matchingDecision.outcome}{selected.matchingDecision.responseSeconds != null ? ` · ${selected.matchingDecision.responseSeconds.toFixed(1)}s response` : ""}</small></div> : null}
      </> : <p>No active job selected.</p>}</aside>
    </div>
  </div>;
}

function Metric({ label, value }) { return <div style={styles.metric}><small>{label}</small><strong>{value}</strong></div>; }

const styles = {
  page: { padding: "clamp(18px, 3vw, 40px)", maxWidth: 1800, margin: "0 auto" }, title: { margin: 0, fontSize: 28 }, meta: { color: "var(--muted)", marginTop: 4 },
  button: { border: "1px solid var(--border)", background: "white", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 },
  filters: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }, select: { border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "white", color: "var(--text)" },
  analytics: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10, marginBottom: 16 }, metric: { display: "grid", gap: 4, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "white" },
  layout: { display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 18, alignItems: "start" }, detail: { border: "1px solid var(--border)", borderRadius: 18, background: "white", padding: 20 },
  eyebrow: { color: "var(--primary)", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }, name: { margin: "5px 0 10px" }, pill: { display: "inline-block", borderRadius: 20, padding: "5px 9px", background: "#e8f5ee", color: "var(--primary)", fontSize: 11, fontWeight: 800, textTransform: "capitalize" },
  list: { display: "grid", gridTemplateColumns: "90px 1fr", gap: 10, margin: "20px 0" }, decision: { padding: 14, background: "#f0f6f3", borderRadius: 12, color: "var(--text)" }, error: { marginBottom: 12, padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 10 }
};

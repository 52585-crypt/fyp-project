import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../config/api";
import { HeatmapMap } from "../components/HeatmapMap";

const PERIODS = [{ value: 7, label: "Last 7 days" }, { value: 30, label: "Last 30 days" }, { value: 90, label: "Last 90 days" }, { value: 365, label: "Last 12 months" }];
const key = (c) => `${c.lat},${c.lng}`;

/** Where requests come from and where online providers are, per ~1 km cell (aggregated by the server). */
export function Heatmap() {
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState("");
  const [showRequests, setShowRequests] = useState(true);
  const [showProviders, setShowProviders] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.get("/api/admin/heatmap", { params: { days, ...(category ? { category } : {}) } });
      setData(response.data);
      setError("");
    } catch (e) {
      setError(e?.message || "Unable to load the heatmap");
    } finally {
      setLoading(false);
    }
  }, [days, category]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, 60000); // online providers move; requests change slowly
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  // Busiest request cells with the online providers currently in the same cell: zero marks a coverage gap.
  const { busiest, gaps } = useMemo(() => {
    if (!data) return { busiest: [], gaps: 0 };
    const providers = new Map(data.providers.map((c) => [key(c), c.count]));
    const rows = data.requests.map((c) => ({ ...c, providers: providers.get(key(c)) || 0 }));
    return { busiest: rows.slice(0, 8), gaps: rows.filter((c) => c.providers === 0).length };
  }, [data]);

  return <div style={styles.page}>
    <div className="page-topbar">
      <div>
        <div className="page-eyebrow">DEMAND &amp; COVERAGE</div>
        <h1 style={styles.title}>Request heatmap</h1>
        <div style={styles.meta}>Islamabad &amp; Rawalpindi · counts per ~{data?.cellKm ?? 1} km cell · refreshes every minute</div>
      </div>
      <button style={styles.button} onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
    </div>
    {error ? <div style={styles.error} role="alert">{error}</div> : null}
    <div style={styles.filters}>
      <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} style={styles.select}>
        {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <select aria-label="Service" value={category} onChange={(e) => setCategory(e.target.value)} style={styles.select}>
        <option value="">All services</option><option value="car_towing">Car towing</option><option value="fuel_delivery">Fuel delivery</option><option value="mechanic">Mechanic</option>
      </select>
      <label style={styles.check}><input type="checkbox" checked={showRequests} onChange={(e) => setShowRequests(e.target.checked)} /> Requests</label>
      <label style={styles.check}><input type="checkbox" checked={showProviders} onChange={(e) => setShowProviders(e.target.checked)} /> Online providers</label>
    </div>
    <div style={styles.metrics}>
      <Metric label="Requests in period" value={data ? data.totals.requests : "—"} />
      <Metric label="Cells with requests" value={data ? data.requests.length : "—"} />
      <Metric label="Online providers now" value={data ? data.totals.onlineProviders : "—"} />
      <Metric label="Request cells with no provider online" value={data ? gaps : "—"} />
    </div>
    <div style={styles.layout}>
      <HeatmapMap data={data} showRequests={showRequests} showProviders={showProviders} />
      <aside style={styles.side}>
        <h2 style={styles.h2}>Busiest cells</h2>
        {busiest.length ? <table style={styles.table}>
          <thead><tr><th style={styles.th}>Cell centre</th><th style={styles.thNum}>Requests</th><th style={styles.thNum}>Online now</th></tr></thead>
          <tbody>{busiest.map((c) => <tr key={key(c)}>
            <td style={styles.td}>{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</td>
            <td style={styles.tdNum}>{c.count}</td>
            <td style={{ ...styles.tdNum, ...(c.providers ? null : styles.gap) }}>{c.providers || "none"}</td>
          </tr>)}</tbody>
        </table> : <p style={styles.meta}>{data ? "No requests in this period." : "Loading…"}</p>}
        <p style={styles.note}>Pickup points are grouped into ~1 km cells by the server; individual customer locations are never sent to this page.</p>
      </aside>
    </div>
  </div>;
}

function Metric({ label, value }) { return <div style={styles.metric}><small>{label}</small><strong style={styles.figure}>{value}</strong></div>; }

const styles = {
  page: { padding: "clamp(18px, 3vw, 40px)", maxWidth: 1800, margin: "0 auto" }, title: { margin: 0, fontSize: 28 }, meta: { color: "var(--muted)", marginTop: 4 },
  button: { border: "1px solid var(--border)", background: "white", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 },
  filters: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  select: { border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "white", color: "var(--text)" },
  check: { display: "flex", alignItems: "center", gap: 6, fontWeight: 600 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 16 },
  metric: { display: "grid", gap: 4, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "white" }, figure: { fontSize: 22 },
  layout: { display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 18, alignItems: "start" },
  side: { border: "1px solid var(--border)", borderRadius: 18, background: "white", padding: 20 }, h2: { margin: "0 0 12px", fontSize: 18 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", color: "var(--muted)", fontWeight: 700, padding: "6px 4px", borderBottom: "1px solid var(--border)" },
  thNum: { textAlign: "right", color: "var(--muted)", fontWeight: 700, padding: "6px 4px", borderBottom: "1px solid var(--border)" },
  td: { padding: "8px 4px", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" },
  tdNum: { padding: "8px 4px", borderBottom: "1px solid var(--border)", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 },
  gap: { color: "#991b1b" }, note: { color: "var(--muted)", fontSize: 12, marginTop: 14 },
  error: { marginBottom: 12, padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 10 }
};

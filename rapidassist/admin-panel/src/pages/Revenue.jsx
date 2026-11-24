import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../config/api";
import { sharedStyles } from "../styles/adminStyles";

const CATEGORIES = [
  { key: "car_towing", label: "Car Towing" },
  { key: "fuel_delivery", label: "Fuel Delivery" },
  { key: "mechanic", label: "Mechanic Service" }
];

function formatCurrency(value) {
  return `PKR ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function Revenue() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  async function load() {
    try {
      setError("");
      const [revenueRes, settingsRes] = await Promise.all([
        adminApi.get("/api/admin/revenue"),
        adminApi.get("/api/admin/settings/monetization")
      ]);
      setData(revenueRes.data);
      setSettings(settingsRes.data.settings);
      setForm(toForm(settingsRes.data.settings));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load revenue");
    }
  }

  useEffect(() => {
    let mounted = true;
    async function loadWhenMounted() {
      if (mounted) await load();
    }
    loadWhenMounted();
    return () => {
      mounted = false;
    };
  }, []);

  async function saveSettings(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      const payload = {
        commissionRates: Object.fromEntries(CATEGORIES.map((c) => [c.key, Number(form.rates[c.key]) / 100])),
        platformFees: Object.fromEntries(CATEGORIES.map((c) => [c.key, Number(form.fees[c.key])])),
        providerDebtLimit: Number(form.providerDebtLimit),
        minTopupAmount: Number(form.minTopupAmount)
      };
      const res = await adminApi.patch("/api/admin/settings/monetization", payload);
      setSettings(res.data.settings);
      setForm(toForm(res.data.settings));
      setSavedAt(new Date());
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const totals = data?.totals || {};
  const daily = data?.daily || [];
  const maxDaily = Math.max(1, ...daily.map((d) => d.platformRevenue));

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.title}>Revenue</div>
          <div style={styles.subtitle}>Platform income from commission and service fees on completed jobs.</div>
        </div>
        <div style={styles.nav}>
          <button type="button" onClick={load} style={styles.button}>Refresh</button>
          <Link to="/dashboard" style={styles.link}>Dashboard</Link>
          <Link to="/payouts" style={styles.link}>Provider Dues</Link>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.grid4}>
        <TotalCard title="Today" totals={totals.today} />
        <TotalCard title="Last 7 days" totals={totals.week} />
        <TotalCard title="Last 30 days" totals={totals.month} />
        <TotalCard title="All time" totals={totals.allTime} highlight />
      </div>

      <div style={styles.twoColumn}>
        <Panel title="Revenue by service">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Service</th>
                <th style={styles.thRight}>Jobs</th>
                <th style={styles.thRight}>Customer paid</th>
                <th style={styles.thRight}>Commission</th>
                <th style={styles.thRight}>Service fee</th>
                <th style={styles.thRight}>Platform total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => {
                const row = data?.byCategory?.[c.key] || {};
                return (
                  <tr key={c.key}>
                    <td style={styles.td}>{c.label}</td>
                    <td style={styles.tdRight}>{row.jobs || 0}</td>
                    <td style={styles.tdRight}>{formatCurrency(row.gross)}</td>
                    <td style={styles.tdRight}>{formatCurrency(row.commission)}</td>
                    <td style={styles.tdRight}>{formatCurrency(row.platformFee)}</td>
                    <td style={{ ...styles.tdRight, fontWeight: 900 }}>{formatCurrency(row.platformRevenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Last 14 days">
          {daily.length === 0 ? (
            <div style={styles.empty}>No settled jobs in the last 14 days.</div>
          ) : (
            <div style={styles.stack}>
              {daily.map((day) => (
                <div key={day.date} style={styles.barRow}>
                  <span style={styles.barLabel}>{day.date.slice(5)}</span>
                  <div style={styles.barTrack}>
                    <div style={{ ...styles.barFill, width: `${(day.platformRevenue / maxDaily) * 100}%` }} />
                  </div>
                  <span style={styles.barValue}>{formatCurrency(day.platformRevenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div style={styles.twoColumn}>
        <Panel title="Recent commission entries">
          {(data?.recentCommissions || []).length === 0 ? (
            <div style={styles.empty}>No commission entries yet.</div>
          ) : (
            <div style={styles.stack}>
              {data.recentCommissions.map((t) => (
                <div key={t.id} style={styles.row}>
                  <div>
                    <div style={styles.rowTitle}>{t.provider?.name || "Provider"}</div>
                    <div style={styles.rowMeta}>
                      {String(t.breakdown?.category || "").replaceAll("_", " ")} - bill {formatCurrency(t.breakdown?.requestTotal)} - provider kept{" "}
                      {formatCurrency(t.breakdown?.providerEarning)}
                    </div>
                    <div style={styles.rowMeta}>{formatDateTime(t.createdAt)}</div>
                  </div>
                  <div style={styles.amount}>{formatCurrency(Math.abs(t.amount))}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Commission settings">
          {form ? (
            <form onSubmit={saveSettings}>
              <div style={styles.settingsHint}>
                New rates apply to new requests only. Existing requests keep the rate they were created with.
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Service</th>
                    <th style={styles.th}>Commission %</th>
                    <th style={styles.th}>Service fee (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((c) => (
                    <tr key={c.key}>
                      <td style={styles.td}>{c.label}</td>
                      <td style={styles.td}>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          value={form.rates[c.key]}
                          onChange={(e) => setForm({ ...form, rates: { ...form.rates, [c.key]: e.target.value } })}
                          style={styles.input}
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={form.fees[c.key]}
                          onChange={(e) => setForm({ ...form, fees: { ...form.fees, [c.key]: e.target.value } })}
                          style={styles.input}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={styles.settingsRow}>
                <label style={styles.label}>
                  Provider dues limit (PKR)
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={form.providerDebtLimit}
                    onChange={(e) => setForm({ ...form, providerDebtLimit: e.target.value })}
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  Minimum dues payment (PKR)
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={form.minTopupAmount}
                    onChange={(e) => setForm({ ...form, minTopupAmount: e.target.value })}
                    style={styles.input}
                  />
                </label>
              </div>
              <div style={styles.settingsFooter}>
                <span style={styles.rowMeta}>
                  {savedAt ? `Saved at ${savedAt.toLocaleTimeString()}` : settings ? "Fuel commission is taken from the delivery fee only." : ""}
                </span>
                <button type="submit" disabled={saving} style={styles.primaryButton}>
                  {saving ? "Saving..." : "Save settings"}
                </button>
              </div>
            </form>
          ) : (
            <div style={styles.empty}>Loading settings...</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function toForm(settings) {
  return {
    rates: Object.fromEntries(CATEGORIES.map((c) => [c.key, Math.round(settings.commissionRates[c.key] * 1000) / 10])),
    fees: Object.fromEntries(CATEGORIES.map((c) => [c.key, settings.platformFees[c.key]])),
    providerDebtLimit: settings.providerDebtLimit,
    minTopupAmount: settings.minTopupAmount
  };
}

function TotalCard({ title, totals, highlight }) {
  const t = totals || {};
  return (
    <div style={{ ...styles.card, ...(highlight ? styles.cardHighlight : null) }}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardValue}>{formatCurrency(t.platformRevenue)}</div>
      <div style={styles.cardMeta}>
        {t.jobs || 0} jobs - commission {formatCurrency(t.commission)} - fees {formatCurrency(t.platformFee)}
      </div>
      <div style={styles.cardMeta}>Customers paid {formatCurrency(t.gross)}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>{title}</div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

const styles = {
  ...sharedStyles,
  grid4: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  card: { border: "1px solid var(--border)", borderRadius: 16, padding: 14, background: "white" },
  cardHighlight: { background: "#111827", color: "white", borderColor: "#111827" },
  cardTitle: { fontWeight: 900, fontSize: 12, opacity: 0.7 },
  cardValue: { marginTop: 8, fontSize: 26, fontWeight: 900 },
  cardMeta: { marginTop: 6, fontSize: 12, fontWeight: 700, opacity: 0.75 },
  barRow: { display: "grid", gridTemplateColumns: "48px 1fr 110px", alignItems: "center", gap: 10 },
  barLabel: { color: "var(--muted)", fontSize: 12, fontWeight: 900 },
  barTrack: { height: 10, borderRadius: 999, background: "var(--surface)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999, background: "var(--primary)" },
  barValue: { color: "var(--text)", fontSize: 12, fontWeight: 900, textAlign: "right" },
  settingsHint: { color: "var(--muted)", fontSize: 12, fontWeight: 700, marginBottom: 10 },
  settingsRow: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label: { display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 900 },
  settingsFooter: { marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }
};

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../config/api";
import { sharedStyles } from "../styles/adminStyles";

const TOPUP_FILTERS = ["pending", "approved", "rejected", "all"];
const WALLET_FILTERS = [
  { key: "dues", label: "With dues" },
  { key: "blocked", label: "Blocked" },
  { key: "all", label: "All" }
];

function formatCurrency(value) {
  return `PKR ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function methodLabel(method) {
  return String(method || "-").replaceAll("_", " ");
}

export function Payouts() {
  const [topupFilter, setTopupFilter] = useState("pending");
  const [walletFilter, setWalletFilter] = useState("dues");
  const [topups, setTopups] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [debtLimit, setDebtLimit] = useState(0);
  const [preview, setPreview] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function loadTopups(filter = topupFilter) {
    const res = await adminApi.get("/api/admin/topups", { params: { status: filter } });
    setTopups(res.data.topups || []);
  }

  async function loadWallets(filter = walletFilter) {
    const res = await adminApi.get("/api/admin/wallets", { params: { filter } });
    setWallets(res.data.wallets || []);
    setDebtLimit(res.data.debtLimit || 0);
  }

  async function loadAll() {
    try {
      setError("");
      await Promise.all([loadTopups(), loadWallets()]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load provider dues");
    }
  }

  useEffect(() => {
    let mounted = true;
    async function loadWhenMounted() {
      if (mounted) await loadAll();
    }
    loadWhenMounted();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupFilter, walletFilter]);

  async function review(topup, decision) {
    const label = decision === "approve" ? "Approve" : "Reject";
    if (!window.confirm(`${label} ${formatCurrency(topup.amount)} from ${topup.provider?.name || "provider"}?`)) return;
    try {
      setBusyId(topup.id);
      setError("");
      await adminApi.patch(`/api/admin/topups/${topup.id}`, { decision });
      await Promise.all([loadTopups(), loadWallets()]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to update payment");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.title}>Provider Dues</div>
          <div style={styles.subtitle}>
            Cash jobs leave the platform share with the provider. Providers above {formatCurrency(debtLimit)} in dues are blocked until they pay.
          </div>
        </div>
        <div style={styles.nav}>
          <button type="button" onClick={loadAll} style={styles.button}>Refresh</button>
          <Link to="/dashboard" style={styles.link}>Dashboard</Link>
          <Link to="/revenue" style={styles.link}>Revenue</Link>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.twoColumn}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>Dues payments</div>
            <Tabs options={TOPUP_FILTERS.map((f) => ({ key: f, label: f }))} value={topupFilter} onChange={setTopupFilter} />
          </div>
          <div style={{ marginTop: 12 }}>
            {topups.length === 0 ? (
              <div style={styles.empty}>No {topupFilter === "all" ? "" : topupFilter} payments.</div>
            ) : (
              <div style={styles.stack}>
                {topups.map((topup) => (
                  <div key={topup.id} style={styles.topupRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.rowTitle}>{topup.provider?.name || "Provider"} - {formatCurrency(topup.amount)}</div>
                      <div style={styles.rowMeta}>
                        {methodLabel(topup.method)} - Ref: {topup.reference || "-"} - {topup.provider?.phone || ""}
                      </div>
                      <div style={styles.rowMeta}>Submitted {formatDateTime(topup.createdAt)}</div>
                      {topup.note ? <div style={styles.rowMeta}>Note: {topup.note}</div> : null}
                      {topup.status !== "pending" ? (
                        <div style={styles.rowMeta}>
                          {topup.status} {formatDateTime(topup.reviewedAt)}
                          {topup.balanceAfter != null ? ` - balance after ${formatCurrency(topup.balanceAfter)}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <div style={styles.actions}>
                      {topup.proofImage ? (
                        <button type="button" style={styles.button} onClick={() => setPreview(topup.proofImage)}>
                          Screenshot
                        </button>
                      ) : null}
                      {topup.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === topup.id}
                            style={{ ...styles.primaryButton, background: "#16a34a" }}
                            onClick={() => review(topup, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === topup.id}
                            style={{ ...styles.primaryButton, background: "#dc2626" }}
                            onClick={() => review(topup, "reject")}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span style={{ ...styles.badge, ...statusTone(topup.status) }}>{topup.status}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>Provider wallets</div>
            <Tabs options={WALLET_FILTERS} value={walletFilter} onChange={setWalletFilter} />
          </div>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            {wallets.length === 0 ? (
              <div style={styles.empty}>No providers in this list.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Provider</th>
                    <th style={styles.thRight}>Jobs</th>
                    <th style={styles.thRight}>Earned</th>
                    <th style={styles.thRight}>Paid</th>
                    <th style={styles.thRight}>Dues</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((wallet) => (
                    <tr key={wallet.providerId}>
                      <td style={styles.td}>
                        <div>{wallet.provider?.name || "Provider"}</div>
                        <div style={styles.rowMeta}>{wallet.provider?.phone}</div>
                      </td>
                      <td style={styles.tdRight}>{wallet.settledJobs}</td>
                      <td style={styles.tdRight}>{formatCurrency(wallet.totalEarned)}</td>
                      <td style={styles.tdRight}>{formatCurrency(wallet.totalPaid)}</td>
                      <td style={{ ...styles.tdRight, color: wallet.dues > 0 ? "#b91c1c" : "var(--text)", fontWeight: 900 }}>
                        {formatCurrency(wallet.dues)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...(wallet.isBlocked ? statusTone("rejected") : statusTone("approved")) }}>
                          {wallet.isBlocked ? "blocked" : "active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {preview ? (
        <div style={styles.overlay} onClick={() => setPreview(null)}>
          <img src={preview} alt="Payment screenshot" style={styles.previewImage} />
        </div>
      ) : null}
    </div>
  );
}

function Tabs({ options, value, onChange }) {
  return (
    <div style={styles.tabs}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          style={{ ...styles.tab, ...(value === option.key ? styles.tabActive : null) }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function statusTone(status) {
  if (status === "approved") return { background: "#dcfce7", color: "#166534" };
  if (status === "rejected") return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#fef3c7", color: "#92400e" };
}

const styles = {
  ...sharedStyles,
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  topupRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "var(--surface)",
    padding: 12
  },
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900, textTransform: "capitalize" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  tab: {
    height: 30,
    border: "1px solid var(--border)",
    borderRadius: 999,
    background: "white",
    color: "var(--muted)",
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    textTransform: "capitalize"
  },
  tabActive: { background: "var(--primary)", borderColor: "var(--primary)", color: "white" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "grid",
    placeItems: "center",
    padding: 24,
    cursor: "zoom-out"
  },
  previewImage: { maxWidth: "100%", maxHeight: "100%", borderRadius: 12, background: "white" }
};

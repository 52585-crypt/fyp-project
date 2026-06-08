import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
const filters = ["pending", "verified", "rejected", "all"];

function serviceTitle(serviceCategory) {
  if (serviceCategory === "fuel_delivery") return "Fuel Delivery";
  if (serviceCategory === "towing") return "Car Towing";
  return "Mechanic Service";
}

function statusTone(status) {
  if (status === "verified") return { background: "#dcfce7", color: "#166534" };
  if (status === "rejected") return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#fef3c7", color: "#92400e" };
}

function providerDocs(provider) {
  const profile = provider?.mechanicProfile || {};
  return [
    { label: "Selfie", value: profile.selfieUrl },
    { label: "ID front", value: profile.idCardFrontUrl },
    { label: "ID back", value: profile.idCardBackUrl },
    { label: "Workshop photo", value: profile.workshopPhotoUrl },
    { label: "Certificate", value: profile.certificateUrl }
  ];
}

export function ProviderVerification() {
  const [filter, setFilter] = useState("pending");
  const [providers, setProviders] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => providers.find((provider) => provider.id === selectedId) || providers[0] || null,
    [providers, selectedId]
  );

  async function loadProviders(nextFilter = filter) {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`${API_BASE_URL}/api/admin/providers`, { params: { status: nextFilter } });
      setProviders(res.data.providers || []);
      setSelectedId((current) => {
        const exists = (res.data.providers || []).some((provider) => provider.id === current);
        return exists ? current : res.data.providers?.[0]?.id || "";
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }

  async function updateVerification(status) {
    if (!selected) return;

    try {
      setActionLoading(true);
      setError("");
      const res = await axios.patch(`${API_BASE_URL}/api/admin/providers/${selected.id}/verification`, { status });
      const updated = res.data.provider;
      setProviders((current) => {
        if (filter !== "all" && updated.verificationStatus !== filter) {
          return current.filter((provider) => provider.id !== updated.id);
        }

        return current.map((provider) => (provider.id === updated.id ? updated : provider));
      });
      setSelectedId((current) => (current === updated.id && filter !== "all" && updated.verificationStatus !== filter ? "" : current));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to update provider");
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    loadProviders(filter);
  }, [filter]);

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.title}>Provider Verification</div>
          <div style={styles.subtitle}>Review identity documents and approve service providers.</div>
        </div>
        <div style={styles.nav}>
          <Link to="/dashboard" style={styles.link}>Dashboard</Link>
          <Link to="/login" style={styles.link}>Logout</Link>
        </div>
      </div>

      <div style={styles.filterRow}>
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            style={{ ...styles.filterButton, ...(filter === item ? styles.filterButtonActive : null) }}
          >
            {item}
          </button>
        ))}
        <button type="button" onClick={() => loadProviders(filter)} style={styles.refreshButton}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.layout}>
        <div style={styles.list}>
          {providers.length === 0 ? (
            <div style={styles.empty}>No providers found for this filter.</div>
          ) : (
            providers.map((provider) => {
              const selectedProvider = selected?.id === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedId(provider.id)}
                  style={{ ...styles.providerRow, ...(selectedProvider ? styles.providerRowSelected : null) }}
                >
                  <div style={styles.providerName}>{provider.name}</div>
                  <div style={styles.providerMeta}>{serviceTitle(provider.mechanicProfile?.serviceCategory)} - {provider.phone}</div>
                  <span style={{ ...styles.status, ...statusTone(provider.verificationStatus) }}>{provider.verificationStatus}</span>
                </button>
              );
            })
          )}
        </div>

        <div style={styles.detail}>
          {!selected ? (
            <div style={styles.empty}>Select a provider to review.</div>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div>
                  <div style={styles.detailTitle}>{selected.name}</div>
                  <div style={styles.detailMeta}>{serviceTitle(selected.mechanicProfile?.serviceCategory)} provider</div>
                </div>
                <span style={{ ...styles.status, ...statusTone(selected.verificationStatus) }}>{selected.verificationStatus}</span>
              </div>

              <div style={styles.infoGrid}>
                <Info label="Phone" value={selected.phone} />
                <Info label="Completed jobs" value={selected.completedJobs || 0} />
                <Info label="Rating" value={`${selected.ratingAvg || 0} (${selected.ratingCount || 0})`} />
                <Info label="Identity match" value={selected.mechanicProfile?.identityMatch?.status || "pending"} />
                <Info label="Live location" value={selected.mechanicProfile?.liveLocation?.addressText || "Not captured"} />
                <Info label="Joined" value={new Date(selected.createdAt).toLocaleDateString()} />
              </div>

              <div style={styles.sectionTitle}>Documents</div>
              <div style={styles.docs}>
                {providerDocs(selected).map((doc) => (
                  <div key={doc.label} style={styles.doc}>
                    <div style={styles.docLabel}>{doc.label}</div>
                    {doc.value ? (
                      <>
                        <img src={doc.value} alt={doc.label} style={styles.docImage} />
                        <a href={doc.value} target="_blank" rel="noreferrer" style={styles.docLink}>Open full image</a>
                      </>
                    ) : (
                      <div style={styles.missing}>Not uploaded</div>
                    )}
                  </div>
                ))}
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateVerification("rejected")}
                  style={{ ...styles.actionButton, ...styles.rejectButton }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateVerification("pending")}
                  style={{ ...styles.actionButton, ...styles.pendingButton }}
                >
                  Mark Pending
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => updateVerification("verified")}
                  style={{ ...styles.actionButton, ...styles.approveButton }}
                >
                  Approve
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={styles.info}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value || "N/A"}</div>
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
  nav: { display: "flex", alignItems: "center", gap: 14 },
  link: { color: "var(--primary)", fontWeight: 900 },
  filterRow: { marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  filterButton: {
    height: 38,
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "white",
    color: "var(--muted)",
    padding: "0 14px",
    fontWeight: 900,
    textTransform: "capitalize",
    cursor: "pointer"
  },
  filterButtonActive: { background: "var(--primary)", borderColor: "var(--primary)", color: "white" },
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
  layout: { marginTop: 16, display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "start" },
  list: { display: "grid", gap: 10 },
  providerRow: {
    position: "relative",
    width: "100%",
    textAlign: "left",
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "white",
    padding: 14,
    cursor: "pointer"
  },
  providerRowSelected: { borderColor: "var(--primary)", boxShadow: "0 0 0 3px rgba(22, 163, 74, 0.12)" },
  providerName: { color: "var(--text)", fontSize: 15, fontWeight: 900 },
  providerMeta: { marginTop: 4, color: "var(--muted)", fontSize: 12, fontWeight: 700 },
  status: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "capitalize"
  },
  detail: { border: "1px solid var(--border)", borderRadius: 18, background: "white", padding: 16, boxShadow: "var(--shadow)" },
  detailHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  detailTitle: { color: "var(--text)", fontSize: 20, fontWeight: 900 },
  detailMeta: { marginTop: 4, color: "var(--muted)", fontSize: 13, fontWeight: 700 },
  infoGrid: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 },
  info: { border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", padding: 12 },
  infoLabel: { color: "var(--muted)", fontSize: 11, fontWeight: 900 },
  infoValue: { marginTop: 5, color: "var(--text)", fontSize: 13, fontWeight: 900, overflowWrap: "anywhere" },
  sectionTitle: { marginTop: 18, color: "var(--text)", fontSize: 16, fontWeight: 900 },
  docs: { marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 },
  doc: { border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", padding: 10 },
  docLabel: { color: "var(--text)", fontSize: 12, fontWeight: 900 },
  docImage: { marginTop: 8, width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)", background: "white" },
  docLink: { display: "inline-block", marginTop: 8, color: "var(--primary)", fontSize: 12, fontWeight: 900 },
  missing: { marginTop: 8, color: "var(--muted)", fontSize: 12, fontWeight: 800 },
  actions: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 },
  actionButton: { height: 46, border: 0, borderRadius: 14, color: "white", fontWeight: 900, cursor: "pointer" },
  rejectButton: { background: "var(--danger)" },
  pendingButton: { background: "#f59e0b" },
  approveButton: { background: "var(--primary)" },
  empty: { border: "1px solid var(--border)", borderRadius: 14, background: "white", padding: 14, color: "var(--muted)", fontWeight: 800 }
};

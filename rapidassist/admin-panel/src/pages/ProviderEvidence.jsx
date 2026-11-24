import React from "react";
import { faceCheckSummary } from "./providerEvidenceData";

const tones = {
  success: { background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" },
  warning: { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" },
  danger: { background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" },
  muted: { background: "var(--surface)", color: "var(--muted)", borderColor: "var(--border)" }
};

export function FaceCheckBadge({ status }) {
  if (status !== "flagged" && status !== "error") return null;
  const tone = status === "flagged" ? tones.danger : tones.warning;
  return (
    <span style={{ ...styles.badge, background: tone.background, color: tone.color }}>
      {status === "flagged" ? "Possible duplicate" : "Face check failed"}
    </span>
  );
}

export function FaceChecksSection({ faceChecks }) {
  const summary = faceCheckSummary(faceChecks);
  const tone = tones[summary.tone];
  const yaw = faceChecks?.yaw;
  const distance = faceChecks?.samePersonDistance;
  return (
    <>
      <div style={styles.sectionTitle}>Automatic face checks</div>
      <div role={summary.tone === "danger" ? "alert" : undefined} style={{ ...styles.summary, ...tone }}>
        <div style={styles.summaryTitle}>{summary.title}</div>
        <div style={styles.summaryText}>{summary.text}</div>
        {yaw ? (
          <div style={styles.summaryMeta}>
            Head-turn score: straight {yaw.front}, left {yaw.left}, right {yaw.right}
            {distance ? ` · same-person distance: left ${distance.left}, right ${distance.right}` : ""}
            {faceChecks?.duplicate && !faceChecks.duplicate.found && faceChecks.duplicate.distance != null
              ? ` · nearest other provider: ${faceChecks.duplicate.distance}` : ""}
          </div>
        ) : null}
      </div>
    </>
  );
}

export function EvidenceImages({ images, loading }) {
  if (loading) return <div style={styles.missing}>Loading verification photos…</div>;
  if (!images.length) return <div style={styles.missing}>No verification photos submitted.</div>;
  return (
    <div className="detail-grid">
      {images.map((image) => (
        <div key={image.kind} style={styles.doc}>
          <div style={styles.docLabel}>{image.label}</div>
          <img src={image.url} alt={image.label} style={styles.docImage} />
          <a href={image.url} target="_blank" rel="noreferrer" style={styles.docLink}>Open full image</a>
        </div>
      ))}
    </div>
  );
}

const styles = {
  sectionTitle: { marginTop: 18, color: "var(--text)", fontSize: 16, fontWeight: 900 },
  summary: { marginTop: 10, border: "1px solid", borderRadius: 14, padding: 12 },
  summaryTitle: { fontSize: 14, fontWeight: 900 },
  summaryText: { marginTop: 4, fontSize: 13, fontWeight: 700 },
  summaryMeta: { marginTop: 6, fontSize: 12, fontWeight: 700, opacity: 0.85 },
  badge: { display: "inline-flex", marginTop: 10, marginLeft: 6, borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900 },
  doc: { border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", padding: 10 },
  docLabel: { color: "var(--text)", fontSize: 12, fontWeight: 900 },
  docImage: { marginTop: 8, width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)", background: "white" },
  docLink: { display: "inline-block", marginTop: 8, color: "var(--primary)", fontSize: 12, fontWeight: 900 },
  missing: { marginTop: 8, color: "var(--muted)", fontSize: 12, fontWeight: 800 }
};

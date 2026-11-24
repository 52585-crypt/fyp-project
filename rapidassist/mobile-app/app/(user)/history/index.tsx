import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ReviewPromptCard, ReviewSummary } from "../../../src/components/ReviewPromptCard";
import { ComplaintFormCard } from "../../../src/components/ComplaintFormCard";
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS_LABELS, listMyComplaints, type Complaint } from "../../../src/complaints/complaints.api";
import { listMyRequests } from "../../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { useAuth } from "../../../src/auth/AuthProvider";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

function statusTone(status: ServiceRequest["status"]) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  return "warning";
}

function canReview(request: ServiceRequest) {
  return request.status === "completed" && Boolean(request.providerId) && !request.review?.rating;
}

export default function UserHistory() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [reviewTarget, setReviewTarget] = useState<ServiceRequest | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  // undefined = form closed, null = general report (no request), otherwise the request being reported
  const [reportTarget, setReportTarget] = useState<ServiceRequest | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(
    () => requests.filter((request) => request.status === "completed" || request.status === "cancelled"),
    [requests]
  );

  async function loadHistory() {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const [nextRequests, nextComplaints] = await Promise.all([
        listMyRequests(token),
        listMyComplaints(token).catch(() => [] as Complaint[])
      ]);
      setRequests(nextRequests);
      setComplaints(nextComplaints);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, [token]);

  const openComplaintRequestIds = useMemo(
    () => new Set(complaints.filter((c) => c.status === "open" || c.status === "in_review").map((c) => c.requestId)),
    [complaints]
  );

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Service History" subtitle="Completed requests, cancelled requests, and provider reviews.">
        {token && reviewTarget ? (
          <ReviewPromptCard
            token={token}
            request={reviewTarget}
            onSubmitted={(updated) => {
              setReviewTarget(null);
              setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            }}
            onLater={() => setReviewTarget(null)}
          />
        ) : null}

        {token && reportTarget !== undefined ? (
          <ComplaintFormCard
            token={token}
            request={reportTarget}
            onCancel={() => setReportTarget(undefined)}
            onSubmitted={(complaint) => {
              setReportTarget(undefined);
              setComplaints((current) => [complaint, ...current]);
              setNotice("Thanks — your report was sent. We'll reply here.");
            }}
          />
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <PrimaryButton title={loading ? "Refreshing..." : "Refresh History"} icon="refresh" variant="outline" disabled={loading} onPress={loadHistory} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {history.length === 0 ? (
          <Card style={styles.empty}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>No completed requests yet</Text>
              <Text style={styles.subtitle}>Completed and cancelled services will appear here.</Text>
            </View>
          </Card>
        ) : null}

        {history.map((request) => (
          <Card key={request.id} style={styles.row}>
            <View style={styles.top}>
              <IconBox icon={getServiceIcon(request.category)} tone={request.status === "cancelled" ? "danger" : "success"} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{getServiceTitle(request.category)}</Text>
                <Text style={styles.subtitle}>
                  PKR {request.estimate?.total?.toLocaleString() || 0} - {request.pickupLocation?.addressText || "Pickup location"}
                </Text>
                <Text style={styles.date}>{new Date(request.updatedAt).toLocaleString()}</Text>
                <ReviewSummary request={request} />
              </View>
              <StatusPill label={request.status.replaceAll("_", " ")} tone={statusTone(request.status)} />
            </View>
            {canReview(request) ? (
              <PrimaryButton title="Review Provider" icon="star" variant="success" onPress={() => setReviewTarget(request)} />
            ) : null}
            {openComplaintRequestIds.has(request.id) ? (
              <Text style={styles.reported}>Problem reported — our team is looking into it.</Text>
            ) : (
              <PrimaryButton
                title="Report a Problem"
                icon="flag"
                variant="outline"
                onPress={() => {
                  setNotice(null);
                  setReportTarget(request);
                }}
              />
            )}
          </Card>
        ))}

        {complaints.length ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>My reports</Text>
            {complaints.map((complaint) => {
              const lastReply = [...complaint.updates].reverse().find((u) => u.type === "reply" && u.text);
              const closed = complaint.status === "resolved" || complaint.status === "dismissed";
              return (
                <Card key={complaint.id} style={styles.row}>
                  <View style={styles.top}>
                    <IconBox icon="flag" tone={closed ? "success" : "warning"} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>
                        {COMPLAINT_CATEGORIES.find((c) => c.value === complaint.category)?.label || "Report"}
                      </Text>
                      <Text style={styles.subtitle} numberOfLines={2}>
                        {complaint.description}
                      </Text>
                      <Text style={styles.date}>{new Date(complaint.createdAt).toLocaleString()}</Text>
                    </View>
                    <StatusPill label={COMPLAINT_STATUS_LABELS[complaint.status]} tone={closed ? "success" : "warning"} />
                  </View>
                  {complaint.resolution ? (
                    <View style={styles.reply}>
                      <Text style={styles.replyLabel}>RapidAssist support</Text>
                      <Text style={styles.replyText}>{complaint.resolution}</Text>
                    </View>
                  ) : lastReply ? (
                    <View style={styles.reply}>
                      <Text style={styles.replyLabel}>RapidAssist support</Text>
                      <Text style={styles.replyText}>{lastReply.text}</Text>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ) : null}

        <PrimaryButton
          title="Report Another Problem"
          icon="help-buoy"
          variant="outline"
          style={{ marginTop: 14 }}
          onPress={() => {
            setNotice(null);
            setReportTarget(null);
          }}
        />
      </AppShell>
      <BottomNav role="user" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  row: { gap: 12, marginTop: 10 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  subtitle: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  date: { marginTop: 3, color: ui.colors.primary, fontSize: 11, fontWeight: "800" },
  error: { marginTop: 10, color: ui.colors.danger, fontSize: 12, fontWeight: "800" },
  notice: { marginBottom: 10, color: ui.colors.success, fontSize: 12, fontWeight: "800" },
  reported: { color: ui.colors.warning, fontSize: 12, fontWeight: "800" },
  sectionTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900", marginBottom: 2 },
  reply: { backgroundColor: ui.colors.surfaceAlt, borderRadius: ui.radius.md, padding: 12 },
  replyLabel: { color: ui.colors.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  replyText: { marginTop: 4, color: ui.colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 }
});

import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { acceptRequest, getRequest, updateRequestStatus } from "../../../src/requests/requests.api";
import { getRequestTitle, getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, SectionTitle, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

function formatValue(value?: string | number | null) {
  if (value == null || value === "") return "N/A";
  return String(value);
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{formatValue(value)}</Text>
    </View>
  );
}

export default function ProviderRequestDetails() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isClosed = request?.status === "completed" || request?.status === "cancelled";

  async function loadRequest() {
    if (!token || !params.requestId) return;
    try {
      setLoading(true);
      setError(null);
      setRequest(await getRequest(token, params.requestId));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load request details");
    } finally {
      setLoading(false);
    }
  }

  async function onAccept() {
    if (!token || !request) return;
    try {
      setAccepting(true);
      setError(null);
      const accepted = await acceptRequest(token, request.id);
      router.replace({
        pathname: "/(provider)/jobs",
        params: { requestId: accepted.id, category: accepted.category }
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to accept request");
    } finally {
      setAccepting(false);
    }
  }

  async function onCancelRequest() {
    if (!token || !request) return;
    try {
      setCancelling(true);
      setError(null);
      const updated = await updateRequestStatus(
        token,
        request.id,
        "cancelled",
        cancelReason.trim() || "Provider cancelled from request details"
      );
      setRequest(updated);
      setShowCancel(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to cancel request");
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    loadRequest();
  }, [params.requestId, token]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Request Details" subtitle={request ? getRequestTitle(request.category) : "Review incoming job before accepting."}>
        <Card style={styles.summary}>
          <IconBox icon={getServiceIcon(request?.category)} tone="success" />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>{request ? getServiceTitle(request.category) : "Loading request"}</Text>
            <Text style={styles.summaryText}>
              {request?.pickupLocation?.addressText || (loading ? "Loading pickup location..." : "Pickup location unavailable")}
            </Text>
          </View>
          {request ? (
            <StatusPill
              label={request.status === "cancelled" ? "Cancelled" : `PKR ${request.estimate?.total?.toLocaleString() || 0}`}
              tone={request.status === "cancelled" ? "danger" : "success"}
            />
          ) : null}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {request ? (
          <>
            <SectionTitle title="Service information" action={request.status.replaceAll("_", " ")} />
            <Card style={styles.block}>
              <DetailRow label="Service" value={getServiceTitle(request.category)} />
              <DetailRow label="Issue type" value={request.issueType?.replaceAll("_", " ")} />
              <DetailRow label="Description" value={request.description} />
              {request.category === "fuel_delivery" ? (
                <>
                  <DetailRow label="Fuel type" value={request.fuelDetails?.fuelType?.toUpperCase()} />
                  <DetailRow label="Liters" value={request.fuelDetails?.liters} />
                </>
              ) : null}
              {request.category === "mechanic" ? (
                <DetailRow label="Mechanic issue" value={request.mechanicDetails?.issueCategory?.replaceAll("_", " ")} />
              ) : null}
            </Card>

            <SectionTitle title="Vehicle" />
            <Card style={styles.block}>
              <DetailRow label="Type" value={request.vehicleInfo?.type} />
              <DetailRow label="Make" value={request.vehicleInfo?.make} />
              <DetailRow label="Model" value={request.vehicleInfo?.model} />
              <DetailRow label="Registration" value={request.vehicleInfo?.registrationNumber} />
            </Card>

            <SectionTitle title="Locations" />
            <Card style={styles.block}>
              <DetailRow label="Pickup" value={request.pickupLocation?.addressText || `${request.pickupLocation?.lat}, ${request.pickupLocation?.lng}`} />
              {request.destinationLocation ? (
                <DetailRow label="Destination" value={request.destinationLocation.addressText || `${request.destinationLocation.lat}, ${request.destinationLocation.lng}`} />
              ) : null}
            </Card>

            <SectionTitle title="Estimate" />
            <Card style={styles.block}>
              {(request.estimate?.lines || []).map((line) => (
                <DetailRow key={line.label} label={line.label} value={`PKR ${line.amount.toLocaleString()}`} />
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>PKR {(request.estimate?.total || 0).toLocaleString()}</Text>
              </View>
            </Card>

            <View style={styles.actions}>
              <PrimaryButton title="Back" variant="outline" style={{ flex: 1 }} onPress={() => router.back()} />
              <PrimaryButton
                title={accepting ? "Accepting..." : "Accept Job"}
                icon="checkmark"
                variant="success"
                disabled={accepting || request.status !== "searching_provider"}
                style={{ flex: 1 }}
                onPress={onAccept}
              />
            </View>

            {request.status === "cancelled" ? (
              <Card style={styles.cancelledBox}>
                <Text style={styles.cancelledText}>This request has been cancelled.</Text>
              </Card>
            ) : showCancel ? (
              <Card style={styles.cancelBox}>
                <Text style={styles.cancelTitle}>Cancel this request?</Text>
                <Text style={styles.cancelText}>This will remove the request from active provider work.</Text>
                <Field
                  label="Reason"
                  icon="document-text"
                  placeholder="Reason for cancellation"
                  value={cancelReason}
                  onChangeText={setCancelReason}
                />
                <View style={styles.actions}>
                  <PrimaryButton title="Keep Request" variant="outline" style={{ flex: 1 }} onPress={() => setShowCancel(false)} />
                  <PrimaryButton
                    title={cancelling ? "Cancelling..." : "Confirm Cancel"}
                    icon="close-circle"
                    variant="danger"
                    disabled={cancelling}
                    style={{ flex: 1 }}
                    onPress={onCancelRequest}
                  />
                </View>
              </Card>
            ) : (
              <PrimaryButton
                title={request.providerId ? "Cancel Job" : "Cancel Request"}
                icon="close-circle"
                variant="outline"
                disabled={isClosed}
                onPress={() => setShowCancel(true)}
              />
            )}
          </>
        ) : (
          <Card style={styles.empty}>
            <Ionicons name="reader" size={24} color={ui.colors.muted} />
            <Text style={styles.emptyText}>{loading ? "Loading request details..." : "No request selected."}</Text>
          </Card>
        )}
      </AppShell>
      <BottomNav role="provider" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryTitle: { color: ui.colors.text, fontSize: 17, fontWeight: "900" },
  summaryText: { marginTop: 4, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  block: { gap: 11 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  detailLabel: { flex: 0.9, color: ui.colors.muted, fontSize: 12, fontWeight: "900" },
  detailValue: { flex: 1.4, color: ui.colors.text, fontSize: 13, fontWeight: "800", textAlign: "right", lineHeight: 18, textTransform: "capitalize" },
  totalRow: { marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: ui.colors.border, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  totalValue: { color: ui.colors.success, fontSize: 15, fontWeight: "900" },
  actions: { marginTop: 16, flexDirection: "row", gap: 10 },
  cancelBox: { marginTop: 12, gap: 12, borderColor: ui.colors.dangerSoft },
  cancelTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  cancelText: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  cancelledBox: { marginTop: 12, borderColor: ui.colors.dangerSoft },
  cancelledText: { color: ui.colors.danger, fontSize: 13, fontWeight: "900" },
  empty: { alignItems: "center", gap: 8 },
  emptyText: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  error: { marginTop: 10, color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});

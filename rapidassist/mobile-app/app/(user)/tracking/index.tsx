import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../../src/auth/AuthProvider";
import { approveExtraWork, listMyRequests } from "../../../src/requests/requests.api";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const baseSteps = ["Searching", "Assigned", "On way", "Arrived", "In progress", "Completed"];

function activeStep(status?: ServiceRequest["status"]) {
  if (!status || status === "searching_provider") return 0;
  if (status === "provider_assigned") return 1;
  if (status === "provider_on_way") return 2;
  if (status === "provider_arrived") return 3;
  if (status === "completed") return 5;
  return 4;
}

function titleFor(category?: ServiceRequest["category"]) {
  if (category === "fuel_delivery") return "Fuel Delivery";
  if (category === "mechanic") return "Mechanic";
  return "Car Towing";
}

export default function UserTracking() {
  const { token } = useAuth();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const step = useMemo(() => activeStep(request?.status), [request?.status]);
  const extraWork = request?.mechanicDetails?.extraWork;

  async function load() {
    if (!token) return;
    try {
      setError(null);
      const requests = await listMyRequests(token);
      setRequest(
        requests.find((item) => item.status !== "completed" && item.status !== "cancelled") || requests[0] || null
      );
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load tracking");
    }
  }

  async function onApproveExtraWork(approved: boolean) {
    if (!token || !request) return;
    try {
      const updated = await approveExtraWork(token, request.id, approved);
      setRequest(updated);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to update extra work");
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Live Tracking" subtitle={request ? `${titleFor(request.category)} - ${request.status.replaceAll("_", " ")}` : "Provider route and request progress."}>
        <View style={styles.map}>
          <View style={styles.road} />
          <View style={styles.pinUser}><Ionicons name="person" size={18} color="white" /></View>
          <View style={styles.pinProvider}><Ionicons name={request?.category === "mechanic" ? "construct" : request?.category === "fuel_delivery" ? "water" : "car"} size={18} color="white" /></View>
          <Text style={styles.mapText}>{request?.pickupLocation?.addressText || "Map preview"}</Text>
        </View>

        <Card style={styles.provider}>
          <View style={styles.providerTop}>
            <IconBox icon={request?.category === "mechanic" ? "construct" : request?.category === "fuel_delivery" ? "water" : "car"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{request ? titleFor(request.category) : "No active request"}</Text>
              <Text style={styles.providerMeta}>
                {request ? `PKR ${request.estimate?.total?.toLocaleString() || 0} - ${request.pickupLocation?.addressText || "Pickup"}` : "Create a request to start tracking."}
              </Text>
            </View>
            {request ? <StatusPill label={request.status.replaceAll("_", " ")} tone="warning" /> : null}
          </View>
          <View style={styles.actions}>
            <PrimaryButton title="Refresh" icon="refresh" style={{ flex: 1 }} onPress={load} />
            <PrimaryButton title="Chat" icon="chatbubble" variant="outline" style={{ flex: 1 }} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        {extraWork && request?.status === "extra_work_requested" ? (
          <Card style={styles.extra}>
            <Text style={styles.extraTitle}>Extra work approval</Text>
            <Text style={styles.extraText}>{extraWork.description || extraWork.partName || "Additional work required"}</Text>
            <Text style={styles.extraPrice}>PKR {((extraWork.partPrice || 0) + (extraWork.laborCharge || 0)).toLocaleString()}</Text>
            <View style={styles.actions}>
              <PrimaryButton title="Reject" variant="outline" style={{ flex: 1 }} onPress={() => onApproveExtraWork(false)} />
              <PrimaryButton title="Approve" variant="success" style={{ flex: 1 }} onPress={() => onApproveExtraWork(true)} />
            </View>
          </Card>
        ) : null}

        <Card style={styles.stepsCard}>
          {baseSteps.map((stepLabel, index) => (
            <View key={stepLabel} style={styles.stepRow}>
              <View style={[styles.stepDot, index <= step ? styles.stepDotActive : null]} />
              <Text style={[styles.stepText, index <= step ? styles.stepTextActive : null]}>{stepLabel}</Text>
            </View>
          ))}
        </Card>
      </AppShell>
      <BottomNav role="user" active="Track" />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 260, borderRadius: 22, backgroundColor: ui.colors.primarySoft, overflow: "hidden", borderWidth: 1, borderColor: ui.colors.border, marginBottom: 12 },
  road: { position: "absolute", width: 420, height: 90, borderRadius: 60, backgroundColor: "rgba(37,99,235,0.28)", transform: [{ rotate: "-24deg" }], left: -40, top: 100 },
  pinUser: { position: "absolute", left: 52, bottom: 48, width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  pinProvider: { position: "absolute", right: 72, top: 62, width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.success, alignItems: "center", justifyContent: "center" },
  mapText: { position: "absolute", left: 16, top: 16, color: ui.colors.primaryDark, fontSize: 13, fontWeight: "900" },
  provider: { gap: 14 },
  providerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerName: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  providerMeta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10 },
  extra: { marginTop: 12, gap: 10 },
  extraTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  extraText: { color: ui.colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  extraPrice: { color: ui.colors.primary, fontSize: 18, fontWeight: "900" },
  stepsCard: { gap: 12, marginTop: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: ui.colors.border },
  stepDotActive: { backgroundColor: ui.colors.primary },
  stepText: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  stepTextActive: { color: ui.colors.text },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});


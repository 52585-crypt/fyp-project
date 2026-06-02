import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { getProviderActiveRequest, requestExtraWork, updateRequestStatus } from "../../../src/requests/requests.api";
import type { RequestStatus, ServiceRequest } from "../../../src/requests/requests.types";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const flows: Record<string, Array<{ label: string; status: RequestStatus }>> = {
  towing: [
    { label: "On the way", status: "provider_on_way" },
    { label: "Arrived", status: "provider_arrived" },
    { label: "Vehicle loaded", status: "vehicle_loaded" },
    { label: "Reached destination", status: "reached_destination" },
    { label: "Completed", status: "completed" }
  ],
  fuel_delivery: [
    { label: "On the way", status: "provider_on_way" },
    { label: "Arrived", status: "provider_arrived" },
    { label: "Fuel delivered", status: "fuel_delivered" },
    { label: "Completed", status: "completed" }
  ],
  mechanic: [
    { label: "On the way", status: "provider_on_way" },
    { label: "Arrived", status: "provider_arrived" },
    { label: "Inspection started", status: "inspection_started" },
    { label: "Work started", status: "work_started" },
    { label: "Completed", status: "completed" }
  ]
};

export default function ProviderJobs() {
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string; category?: string }>();
  const service = params.category === "car_towing" ? "towing" : params.category || user?.mechanicProfile?.serviceCategory || "mechanic";
  const steps = useMemo(() => flows[service] || flows.mechanic, [service]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [requestId, setRequestId] = useState(params.requestId || "");
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadActive() {
      if (!token) return;
      try {
        const request = await getProviderActiveRequest(token);
        setActiveRequest(request);
        if (request) setRequestId(request.id);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || "Failed to load active job");
      }
    }
    loadActive();
  }, [token]);

  async function markNext() {
    const next = steps[activeIndex];
    if (!next) return;
    if (!token || !requestId.trim()) {
      setActiveIndex((current) => Math.min(current + 1, steps.length - 1));
      return;
    }

    try {
      setError(null);
      const updated = await updateRequestStatus(token, requestId.trim(), next.status);
      setActiveRequest(updated);
      setActiveIndex((current) => Math.min(current + 1, steps.length - 1));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to update status");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Active Job" subtitle="Update request status as work progresses.">
        <View style={styles.map}>
          <View style={styles.route} />
          <View style={styles.pin}><Ionicons name="location" size={18} color="white" /></View>
          <Text style={styles.mapText}>Customer route</Text>
        </View>

        <Card style={styles.customer}>
          <View style={styles.customerTop}>
            <IconBox icon={service === "fuel_delivery" ? "water" : service === "towing" ? "car" : "construct"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{(activeRequest?.category || service).replace("_", " ").toUpperCase()} job</Text>
              <Text style={styles.meta}>
                {activeRequest?.pickupLocation?.addressText || "Load or accept a request to update backend status."}
              </Text>
            </View>
            <StatusPill label="Assigned" />
          </View>
          <Field label="Request ID" icon="reader" placeholder="Paste assigned request ID" value={requestId} onChangeText={setRequestId} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>

        <Card style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.status} style={styles.stepRow}>
              <View style={[styles.stepDot, index <= activeIndex ? styles.stepDotActive : null]} />
              <Text style={[styles.stepText, index <= activeIndex ? styles.stepTextActive : null]}>{step.label}</Text>
            </View>
          ))}
        </Card>

        <PrimaryButton title={`Mark ${steps[activeIndex]?.label || "Completed"}`} icon="navigate" variant="success" onPress={markNext} />
        {activeRequest?.category === "mechanic" ? (
          <PrimaryButton
            title="Request Extra Work Approval"
            icon="construct"
            variant="outline"
            onPress={async () => {
              if (!token || !requestId.trim()) return;
              try {
                const updated = await requestExtraWork(token, requestId.trim(), {
                  partName: "Replacement part",
                  partPrice: 1200,
                  laborCharge: 700,
                  estimatedTime: "30 min",
                  description: "Additional repair required after inspection"
                });
                setActiveRequest(updated);
              } catch (e: any) {
                setError(e?.response?.data?.message || e?.message || "Failed to request extra work");
              }
            }}
          />
        ) : null}
        <PrimaryButton title="Cancel Job" variant="outline" />
      </AppShell>
      <BottomNav role="provider" active="Jobs" />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 240, borderRadius: 22, backgroundColor: ui.colors.primarySoft, overflow: "hidden", borderWidth: 1, borderColor: ui.colors.border, marginBottom: 12 },
  route: { position: "absolute", width: 420, height: 90, borderRadius: 60, backgroundColor: "rgba(37,99,235,0.28)", transform: [{ rotate: "20deg" }], left: -60, top: 94 },
  pin: { position: "absolute", right: 70, top: 76, width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  mapText: { position: "absolute", left: 16, top: 16, color: ui.colors.primaryDark, fontSize: 13, fontWeight: "900" },
  customer: { gap: 14 },
  customerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  meta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  steps: { marginTop: 12, gap: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: ui.colors.border },
  stepDotActive: { backgroundColor: ui.colors.success },
  stepText: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  stepTextActive: { color: ui.colors.text },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});

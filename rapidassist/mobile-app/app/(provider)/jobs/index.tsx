import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useDispatchUpdates } from "../../../src/requests/DispatchProvider";
import { getDrivingRouteMetrics } from "../../../src/services/routing";
import type { Coordinate } from "../../../src/utils/distance";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { LocationMapPreview } from "../../../src/components/LocationMapPreview";
import { getRequest, getProviderActiveRequest, requestExtraWork, updateRequestStatus } from "../../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle, providerJobFlows, providerServiceFromRequestCategory } from "../../../src/requests/serviceCatalog";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";
import { canNavigateTo, openExternalNavigation } from "../../../src/utils/navigation";


function requestCoordinate(location?: ServiceRequest["pickupLocation"] | null) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return { latitude: location.lat, longitude: location.lng };
}

export default function ProviderJobs() {
  const { token, user } = useAuth();
  const { activeJob, refresh, error: syncError } = useDispatchUpdates();
  const [route, setRoute] = useState<Coordinate[]>([]);
  const [eta, setEta] = useState<number | null>(null);
  const params = useLocalSearchParams<{ requestId?: string; category?: string }>();
  const [requestId, setRequestId] = useState(params.requestId || "");
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [updating, setUpdating] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const service = useMemo(
    () => providerServiceFromRequestCategory(activeRequest?.category || params.category || user?.mechanicProfile?.serviceCategory),
    [activeRequest?.category, params.category, user?.mechanicProfile?.serviceCategory]
  );
  const steps = useMemo(() => providerJobFlows[service], [service]);
  const isCompleted = activeRequest?.status === "completed";
  const isCancelled = activeRequest?.status === "cancelled";
  const waitingCustomerConfirmation = activeRequest?.status === "service_finished";
  const isClosed = isCompleted || isCancelled;
  const nextStepIndex = useMemo(() => {
    if (!activeRequest) return 0;
    if (activeRequest.status === "completed") return steps.length - 1;
    if (activeRequest.status === "cancelled") return 0;
    if (activeRequest.status === "extra_work_requested" || activeRequest.status === "waiting_user_approval") {
      const workStartedIndex = steps.findIndex((step) => step.status === "work_started");
      return workStartedIndex >= 0 ? workStartedIndex : 0;
    }
    const currentIndex = steps.findIndex((step) => step.status === activeRequest.status);
    return currentIndex >= 0 ? Math.min(currentIndex + 1, steps.length - 1) : 0;
  }, [activeRequest, steps]);
  const completedThroughIndex = isCompleted || waitingCustomerConfirmation ? steps.length - 1 : nextStepIndex - 1;

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

  useEffect(() => {
    if (activeJob) { setActiveRequest(activeJob); setRequestId(activeJob.id); }
    else if (activeRequest && !isClosed) {
      // Fetch the terminal state after cancellation/completion on another device.
      getRequest(token!, activeRequest.id).then(setActiveRequest).catch((error) => {
        setError(error?.message || "Unable to refresh job status. Check your connection.");
      });
    }
  }, [activeJob]);

  const providerCoordinate = requestCoordinate(activeRequest?.providerLocation);
  const goingToDestination = activeRequest?.category === "car_towing" && ["vehicle_loaded", "reached_destination"].includes(activeRequest.status);
  const targetCoordinate = requestCoordinate(goingToDestination ? activeRequest?.destinationLocation : activeRequest?.pickupLocation);
  useEffect(() => {
    let cancelled = false;
    setRoute([]); setEta(null);
    if (!providerCoordinate || !targetCoordinate || isClosed) return;
    getDrivingRouteMetrics(providerCoordinate, targetCoordinate).then((metrics) => {
      if (!cancelled) { setRoute(metrics.coordinates); setEta(metrics.durationMinutes); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [providerCoordinate?.latitude, providerCoordinate?.longitude, targetCoordinate?.latitude, targetCoordinate?.longitude, isClosed]);

  async function markNext() {
    const next = steps[nextStepIndex];
    if (!next) return;
    if (!token || !requestId.trim()) {
      return;
    }

    try {
      setUpdating(true);
      setError(null);
      const updated = await updateRequestStatus(token, requestId.trim(), next.status);
      setActiveRequest(updated);
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  async function onCancelJob() {
    if (!token || !requestId.trim()) return;

    try {
      setUpdating(true);
      setError(null);
      const updated = await updateRequestStatus(
        token,
        requestId.trim(),
        "cancelled",
        cancelReason.trim() || "Provider cancelled the job"
      );
      setActiveRequest(updated);
      setShowCancel(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to cancel job");
    } finally {
      setUpdating(false);
    }
  }

  async function openNavigation(location: ServiceRequest["pickupLocation"], label: string) {
    try {
      setError(null);
      await openExternalNavigation(location, label);
    } catch (e: any) {
      setError(e?.message || "Failed to open navigation");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Active Job" subtitle="Update request status as work progresses.">
        {requestCoordinate(activeRequest?.pickupLocation) ? (
          <LocationMapPreview
            pickup={providerCoordinate || requestCoordinate(activeRequest?.pickupLocation)!}
            destination={providerCoordinate ? targetCoordinate : requestCoordinate(activeRequest?.destinationLocation)}
            route={route}
            pickupLabel={providerCoordinate ? "You" : "Pickup"}
            destinationLabel={goingToDestination ? "Drop-off" : "Customer"}
            title={eta ? `${eta} min to ${goingToDestination ? "drop-off" : "pickup"}` : "Waiting for live route"}
          />
        ) : (
          <View style={styles.map}>
            <View style={styles.route} />
            <View style={styles.pin}><Ionicons name="location" size={18} color="white" /></View>
            <Text style={styles.mapText}>Customer route</Text>
          </View>
        )}

        <Card style={styles.customer}>
          <View style={styles.customerTop}>
            <IconBox icon={getServiceIcon(activeRequest?.category || (service === "towing" ? "car_towing" : service))} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{getServiceTitle(activeRequest?.category || (service === "towing" ? "car_towing" : service))} job</Text>
              <Text style={styles.meta}>
                {activeRequest?.pickupLocation?.addressText || "Load or accept a request to update backend status."}
              </Text>
            </View>
            <StatusPill
              label={activeRequest?.status?.replaceAll("_", " ") || "Assigned"}
              tone={isCompleted ? "success" : isCancelled ? "danger" : "primary"}
            />
          </View>
          <Field label="Request ID" icon="reader" placeholder="Paste assigned request ID" value={requestId} onChangeText={setRequestId} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {syncError && !isClosed ? <Text style={styles.locationText}>{syncError}</Text> : null}
          {isCompleted ? <Text style={styles.doneText}>This job is completed and moved to your earnings/history.</Text> : null}
          {waitingCustomerConfirmation ? <Text style={styles.waitText}>Service finished. Waiting for customer to tap Complete Job.</Text> : null}
          {isCancelled ? <Text style={styles.cancelledText}>This job was cancelled and removed from active work.</Text> : null}
          {activeRequest ? (
            <PrimaryButton
              title="Open Chat"
              icon="chatbubble"
              variant="outline"
              onPress={() => router.push({ pathname: "/(provider)/chat/[requestId]", params: { requestId: activeRequest.id } })}
            />
          ) : null}
          {activeRequest ? (
            <View style={styles.navActions}>
              <PrimaryButton
                title="Navigate to Customer"
                icon="navigate"
                variant="outline"
                disabled={!canNavigateTo(activeRequest.pickupLocation)}
                style={{ flex: 1 }}
                onPress={() => openNavigation(activeRequest.pickupLocation, "Customer pickup")}
              />
              {activeRequest.category === "car_towing" && activeRequest.destinationLocation ? (
                <PrimaryButton
                  title="Navigate to Drop-off"
                  icon="flag"
                  variant="outline"
                  disabled={!canNavigateTo(activeRequest.destinationLocation)}
                  style={{ flex: 1 }}
                  onPress={() => openNavigation(activeRequest.destinationLocation!, "Drop-off destination")}
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        <Card style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.status} style={styles.stepRow}>
              <View style={[styles.stepDot, index <= completedThroughIndex ? styles.stepDotActive : null]} />
              <Text style={[styles.stepText, index <= completedThroughIndex ? styles.stepTextActive : null]}>{step.label}</Text>
            </View>
          ))}
        </Card>

        {isClosed ? (
          <View style={styles.navActions}>
            {isCompleted && activeRequest ? <PrimaryButton title="Invoice & Payment" icon="receipt" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/(provider)/payment/[requestId]", params: { requestId: activeRequest.id } })} /> : null}
            <PrimaryButton title="Back to Dashboard" icon="speedometer" variant="success" style={{ flex: 1 }} onPress={() => router.replace("/(provider)/dashboard")} />
          </View>
        ) : waitingCustomerConfirmation ? (
          <PrimaryButton title="Waiting Customer Confirmation" icon="time" variant="outline" disabled />
        ) : (
          <PrimaryButton
            title={updating ? "Updating..." : `Mark ${steps[nextStepIndex]?.label || "Completed"}`}
            icon="navigate"
            variant="success"
            disabled={updating}
            onPress={markNext}
          />
        )}
        {activeRequest?.category === "mechanic" && activeRequest.status === "inspection_started" ? (
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
        {!isClosed ? (
          showCancel ? (
            <Card style={styles.cancelBox}>
              <Text style={styles.cancelTitle}>Cancel this job?</Text>
              <Text style={styles.cancelText}>The customer will see the request as cancelled.</Text>
              <Field
                label="Reason"
                icon="document-text"
                placeholder="Reason for cancellation"
                value={cancelReason}
                onChangeText={setCancelReason}
              />
              <View style={styles.cancelActions}>
                <PrimaryButton title="Keep Job" variant="outline" style={{ flex: 1 }} onPress={() => setShowCancel(false)} />
                <PrimaryButton
                  title={updating ? "Cancelling..." : "Confirm Cancel"}
                  icon="close-circle"
                  variant="danger"
                  disabled={updating}
                  style={{ flex: 1 }}
                  onPress={onCancelJob}
                />
              </View>
            </Card>
          ) : (
            <PrimaryButton title="Cancel Job" icon="close-circle" variant="outline" onPress={() => setShowCancel(true)} />
          )
        ) : null}
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
  locationText: { color: ui.colors.primary, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  doneText: { color: ui.colors.success, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  waitText: { color: ui.colors.warning, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  cancelledText: { color: ui.colors.danger, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  cancelBox: { gap: 12, borderColor: ui.colors.dangerSoft },
  cancelTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  cancelText: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  cancelActions: { flexDirection: "row", gap: 10 },
  navActions: { flexDirection: "row", gap: 10 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});

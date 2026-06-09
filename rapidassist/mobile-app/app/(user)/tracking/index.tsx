import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { LocationMapPreview } from "../../../src/components/LocationMapPreview";
import { ReviewPromptCard, ReviewSummary } from "../../../src/components/ReviewPromptCard";
import { approveExtraWork, listMyRequests, updateRequestStatus } from "../../../src/requests/requests.api";
import type { RequestStatus, ServiceRequest } from "../../../src/requests/requests.types";
import { getDrivingRouteMetrics } from "../../../src/services/routing";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";
import { distanceKm, type Coordinate } from "../../../src/utils/distance";

const TRACKING_REFRESH_MS = 5000;

const serviceSteps: Record<ServiceRequest["category"], Array<{ label: string; statuses: RequestStatus[] }>> = {
  car_towing: [
    { label: "Searching", statuses: ["searching_provider"] },
    { label: "Assigned", statuses: ["provider_assigned"] },
    { label: "On way", statuses: ["provider_on_way"] },
    { label: "Arrived", statuses: ["provider_arrived"] },
    { label: "Vehicle loaded", statuses: ["vehicle_loaded"] },
    { label: "Reached destination", statuses: ["reached_destination"] },
    { label: "Confirm", statuses: ["service_finished"] },
    { label: "Completed", statuses: ["completed"] }
  ],
  fuel_delivery: [
    { label: "Searching", statuses: ["searching_provider"] },
    { label: "Assigned", statuses: ["provider_assigned"] },
    { label: "On way", statuses: ["provider_on_way"] },
    { label: "Arrived", statuses: ["provider_arrived"] },
    { label: "Fuel delivered", statuses: ["fuel_delivered"] },
    { label: "Confirm", statuses: ["service_finished"] },
    { label: "Completed", statuses: ["completed"] }
  ],
  mechanic: [
    { label: "Searching", statuses: ["searching_provider"] },
    { label: "Assigned", statuses: ["provider_assigned"] },
    { label: "On way", statuses: ["provider_on_way"] },
    { label: "Arrived", statuses: ["provider_arrived"] },
    { label: "Inspection", statuses: ["inspection_started"] },
    { label: "Approval", statuses: ["extra_work_requested", "waiting_user_approval"] },
    { label: "Work started", statuses: ["work_started"] },
    { label: "Confirm", statuses: ["service_finished"] },
    { label: "Completed", statuses: ["completed"] }
  ]
};

function stepsFor(category?: ServiceRequest["category"]) {
  return serviceSteps[category || "car_towing"];
}

function activeStep(status?: ServiceRequest["status"], category?: ServiceRequest["category"]) {
  const steps = stepsFor(category);
  if (!status) return 0;
  const index = steps.findIndex((item) => item.statuses.includes(status));
  if (index >= 0) return index;
  if (status === "cancelled") return 0;
  return Math.max(0, steps.length - 2);
}

function titleFor(category?: ServiceRequest["category"]) {
  if (category === "fuel_delivery") return "Fuel Delivery";
  if (category === "mechanic") return "Mechanic";
  return "Car Towing";
}

function providerLocationText(request?: ServiceRequest | null) {
  const location = request?.providerLocation;
  if (!location) return "Waiting for provider location.";

  const base = location.addressText || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  if (!location.updatedAt) return base;

  return `${base} - updated ${new Date(location.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function requestCoordinate(location?: ServiceRequest["pickupLocation"] | null) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return { latitude: location.lat, longitude: location.lng };
}

function formatTrackingDistance(value?: number | null) {
  if (!value) return "Waiting";
  return value >= 10 ? `${value.toFixed(0)} km` : `${value.toFixed(1)} km`;
}

function fallbackEtaMinutes(from: Coordinate, to: Coordinate) {
  const km = distanceKm(from, to);
  return Math.max(1, Math.round((km / 30) * 60));
}

export default function UserTracking() {
  const { token } = useAuth();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackedRequestIdRef = useRef<string | null>(null);
  const steps = useMemo(() => stepsFor(request?.category), [request?.category]);
  const step = useMemo(() => activeStep(request?.status, request?.category), [request?.category, request?.status]);
  const providerLocation = useMemo(() => providerLocationText(request), [request?.providerLocation]);
  const providerCoordinate = useMemo(() => requestCoordinate(request?.providerLocation), [request?.providerLocation]);
  const customerCoordinate = useMemo(() => requestCoordinate(request?.pickupLocation), [request?.pickupLocation]);
  const trackingDistance = useMemo(() => formatTrackingDistance(routeDistanceKm), [routeDistanceKm]);
  const extraWork = request?.mechanicDetails?.extraWork;
  const isClosed = request?.status === "completed" || request?.status === "cancelled";
  const canCompleteJob = request?.status === "service_finished";

  async function load() {
    if (!token) return;
    try {
      setError(null);
      const requests = await listMyRequests(token);
      const activeRequest = requests.find((item) => item.status !== "completed" && item.status !== "cancelled");
      const trackedCompletedRequest = trackedRequestIdRef.current
        ? requests.find((item) => item.id === trackedRequestIdRef.current && item.status === "completed")
        : null;
      const latestRequest = requests[0] || null;

      if (trackedCompletedRequest || (!activeRequest && latestRequest?.status === "completed")) {
        setRequest(trackedCompletedRequest || latestRequest);
        return;
      }

      if (activeRequest) {
        trackedRequestIdRef.current = activeRequest.id;
      }
      setRequest(activeRequest || latestRequest);
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

  async function onCancelRequest() {
    if (!token || !request) return;
    try {
      setUpdating(true);
      setError(null);
      const updated = await updateRequestStatus(
        token,
        request.id,
        "cancelled",
        cancelReason.trim() || "User cancelled the request"
      );
      setRequest(updated);
      setShowCancel(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to cancel request");
    } finally {
      setUpdating(false);
    }
  }

  async function onCompleteJob() {
    if (!token || !request || request.status !== "service_finished") return;
    try {
      setUpdating(true);
      setError(null);
      const updated = await updateRequestStatus(token, request.id, "completed", "Customer confirmed service completion");
      setRequest(updated);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to complete job");
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, TRACKING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function loadRouteMetrics() {
      if (!providerCoordinate || !customerCoordinate || isClosed) {
        setRouteDistanceKm(null);
        setEtaMinutes(null);
        return;
      }

      try {
        setRouteLoading(true);
        const metrics = await getDrivingRouteMetrics(providerCoordinate, customerCoordinate);
        if (!cancelled) {
          setRouteDistanceKm(metrics.distanceKm);
          setEtaMinutes(metrics.durationMinutes || fallbackEtaMinutes(providerCoordinate, customerCoordinate));
        }
      } catch {
        if (!cancelled) {
          const fallbackDistance = distanceKm(providerCoordinate, customerCoordinate);
          setRouteDistanceKm(fallbackDistance);
          setEtaMinutes(fallbackEtaMinutes(providerCoordinate, customerCoordinate));
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    loadRouteMetrics();

    return () => {
      cancelled = true;
    };
  }, [customerCoordinate, isClosed, providerCoordinate]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Live Tracking" subtitle={request ? `${titleFor(request.category)} - ${request.status.replaceAll("_", " ")}` : "Provider route and request progress."}>
        {providerCoordinate && customerCoordinate ? (
          <LocationMapPreview
            pickup={providerCoordinate}
            destination={customerCoordinate}
            pickupLabel="Provider"
            destinationLabel="Customer"
            title="Provider live route"
          />
        ) : (
          <View style={styles.map}>
            <View style={styles.road} />
            <View style={styles.pinUser}><Ionicons name="person" size={18} color="white" /></View>
            <View style={styles.pinProvider}><Ionicons name={request?.category === "mechanic" ? "construct" : request?.category === "fuel_delivery" ? "water" : "car"} size={18} color="white" /></View>
            <Text style={styles.mapText}>{providerLocation}</Text>
          </View>
        )}

        <Card style={styles.provider}>
          <View style={styles.metrics}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>ETA</Text>
              <Text style={styles.metricValue}>{routeLoading ? "..." : etaMinutes ? `${etaMinutes} min` : "Waiting"}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricValue}>{routeLoading ? "..." : trackingDistance}</Text>
            </View>
          </View>
          <View style={styles.providerTop}>
            <IconBox icon={request?.category === "mechanic" ? "construct" : request?.category === "fuel_delivery" ? "water" : "car"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{request ? titleFor(request.category) : "No active request"}</Text>
              <Text style={styles.providerMeta}>
                {request ? `PKR ${request.estimate?.total?.toLocaleString() || 0} - ${request.pickupLocation?.addressText || "Pickup"}` : "Create a request to start tracking."}
              </Text>
              {request ? <Text style={styles.locationMeta}>{providerLocation}</Text> : null}
            </View>
            {request ? (
              <StatusPill
                label={request.status.replaceAll("_", " ")}
                tone={request.status === "completed" ? "success" : request.status === "cancelled" ? "danger" : "warning"}
              />
            ) : null}
          </View>
          <View style={styles.actions}>
            <PrimaryButton title="Refresh" icon="refresh" style={{ flex: 1 }} onPress={load} />
            <PrimaryButton
              title="Chat"
              icon="chatbubble"
              variant="outline"
              style={{ flex: 1 }}
              disabled={!request?.providerId}
              onPress={() => {
                if (!request) return;
                router.push({ pathname: "/(user)/chat/[requestId]", params: { requestId: request.id } });
              }}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {request?.status === "cancelled" ? <Text style={styles.cancelledText}>This request has been cancelled.</Text> : null}
          {canCompleteJob ? <Text style={styles.confirmText}>Provider marked the service finished. Confirm completion to unlock rating.</Text> : null}
          {request?.status === "completed" ? <Text style={styles.doneText}>This request is completed.</Text> : null}
          {request?.review?.rating ? <ReviewSummary request={request} /> : null}
        </Card>

        {canCompleteJob ? (
          <Card style={styles.completeBox}>
            <Text style={styles.completeTitle}>Confirm service completion</Text>
            <Text style={styles.completeText}>Tap Complete Job only after the provider has finished the service.</Text>
            <PrimaryButton
              title={updating ? "Completing..." : "Complete Job"}
              icon="checkmark-circle"
              variant="success"
              disabled={updating}
              onPress={onCompleteJob}
            />
          </Card>
        ) : null}

        {token && request?.status === "completed" && request.providerId && !request.review?.rating ? (
          <ReviewPromptCard token={token} request={request} onSubmitted={setRequest} />
        ) : null}

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
          {steps.map((item, index) => (
            <View key={item.label} style={styles.stepRow}>
              <View style={[styles.stepDot, index <= step ? styles.stepDotActive : null]} />
              <Text style={[styles.stepText, index <= step ? styles.stepTextActive : null]}>{item.label}</Text>
            </View>
          ))}
        </Card>

        {request && !isClosed ? (
          showCancel ? (
            <Card style={styles.cancelBox}>
              <Text style={styles.cancelTitle}>Cancel this request?</Text>
              <Text style={styles.cancelText}>The provider will see this request as cancelled.</Text>
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
                  title={updating ? "Cancelling..." : "Confirm Cancel"}
                  icon="close-circle"
                  variant="danger"
                  disabled={updating}
                  style={{ flex: 1 }}
                  onPress={onCancelRequest}
                />
              </View>
            </Card>
          ) : (
            <PrimaryButton title="Cancel Request" icon="close-circle" variant="outline" onPress={() => setShowCancel(true)} />
          )
        ) : null}
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
  metrics: { flexDirection: "row", gap: 10 },
  metricBox: {
    flex: 1,
    minHeight: 70,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surfaceAlt,
    padding: 12,
    justifyContent: "center"
  },
  metricLabel: { color: ui.colors.muted, fontSize: 11, fontWeight: "900" },
  metricValue: { marginTop: 5, color: ui.colors.text, fontSize: 18, fontWeight: "900" },
  providerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerName: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  providerMeta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  locationMeta: { marginTop: 3, color: ui.colors.primary, fontSize: 12, fontWeight: "800", lineHeight: 17 },
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
  doneText: { color: ui.colors.success, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  confirmText: { color: ui.colors.warning, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  cancelledText: { color: ui.colors.danger, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  completeBox: { marginTop: 12, gap: 10, borderColor: ui.colors.successSoft },
  completeTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  completeText: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  cancelBox: { marginTop: 12, gap: 12, borderColor: ui.colors.dangerSoft },
  cancelTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  cancelText: { color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});

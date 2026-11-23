import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { LocationMapPreview } from "../../../src/components/LocationMapPreview";
import { hasOperationalCoordinates, requiresGoogleMap } from "../../../src/services/locationMapPolicy";
import { ReviewPromptCard, ReviewSummary } from "../../../src/components/ReviewPromptCard";
import { approveExtraWork, getRequest, listMyRequests, retryDispatch, updateRequestStatus } from "../../../src/requests/requests.api";
import { useDispatchUpdates } from "../../../src/requests/DispatchProvider";
import { useActiveLocationRefresh } from "../../../src/requests/useActiveLocationRefresh";
import { isActiveCustomerRequest, selectActiveCustomerRequest, verifiedCustomerRequest } from "../../../src/requests/customerTrackingSelection";
import { trackingEmptyTitle, trackingLoadFailure } from "../../../src/requests/trackingLoadState";
import { parseRequestId } from "../../../src/requests/requestId";
import type { RequestStatus, ServiceRequest } from "../../../src/requests/requests.types";
import { getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import { customerEta, useCustomerRoute } from "../../../src/requests/useCustomerRoute";
import { Field, NoticeBanner } from "../../../src/ui/components";
import {
  AppHeader, CustomerScreen, IconButton, IconTile, MetricStrip, PrimaryButton, SectionHeading, StatusBadge, SummaryCard, Surface,
  customerColors, customerStyles
} from "../../../src/ui/customer/components";
import { readCachedRequest, removeCachedRequest, writeCachedRequest } from "../../../src/services/requestCache";
import { formatCurrency } from "../../../src/i18n";

const TRACKING_REFRESH_MS = 5000;

const serviceSteps: Record<ServiceRequest["category"], Array<{ label: string; statuses: RequestStatus[] }>> = {
  car_towing: [
    { label: "Request received", statuses: ["pending", "searching_provider"] },
    { label: "Tow truck assigned", statuses: ["provider_assigned"] },
    { label: "On the way", statuses: ["provider_on_way"] },
    { label: "Provider arrived", statuses: ["provider_arrived"] },
    { label: "Towing in progress", statuses: ["in_progress"] },
    { label: "Vehicle loaded", statuses: ["vehicle_loaded"] },
    { label: "At destination", statuses: ["reached_destination"] },
    { label: "Service finished", statuses: ["service_finished"] },
    { label: "Completed", statuses: ["completed"] }
  ],
  fuel_delivery: [
    { label: "Request received", statuses: ["pending", "searching_provider"] },
    { label: "Fuel provider assigned", statuses: ["provider_assigned"] },
    { label: "On the way", statuses: ["provider_on_way"] },
    { label: "Provider arrived", statuses: ["provider_arrived"] },
    { label: "Delivery in progress", statuses: ["in_progress"] },
    { label: "Fuel delivered", statuses: ["fuel_delivered"] },
    { label: "Service finished", statuses: ["service_finished"] },
    { label: "Completed", statuses: ["completed"] }
  ],
  mechanic: [
    { label: "Request received", statuses: ["pending", "searching_provider"] },
    { label: "Mechanic assigned", statuses: ["provider_assigned"] },
    { label: "On the way", statuses: ["provider_on_way"] },
    { label: "Provider arrived", statuses: ["provider_arrived"] },
    { label: "Inspection started", statuses: ["inspection_started"] },
    { label: "Estimate approval", statuses: ["extra_work_requested", "waiting_user_approval"] },
    { label: "Repair in progress", statuses: ["work_started", "in_progress"] },
    { label: "Service finished", statuses: ["service_finished"] },
    { label: "Completed", statuses: ["completed"] }
  ]
};

function providerLocationText(request?: ServiceRequest | null) {
  const location = request?.providerLocation;
  if (!hasOperationalCoordinates(location)) return "Waiting for provider location…";

  const base = location.addressText || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  if (!location.updatedAt) return base;

  return `${base} · ${new Date(location.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function UserTracking() {
  const { requestId: parameter } = useLocalSearchParams<{ requestId?: string | string[] }>();
  const { user } = useAuth();
  const requestId = parseRequestId(parameter);
  const invalid = parameter !== undefined && !requestId;
  return <Tracking
    key={JSON.stringify([user?.id, requestId, invalid])}
    customerId={user?.id}
    requestId={requestId}
    invalid={invalid}
  />;
}

function Tracking({ customerId, requestId, invalid }: { customerId?: string; requestId: string | null; invalid: boolean }) {
  const { token } = useAuth();
  const navigation = useNavigation();
  const { revision, connected } = useDispatchUpdates();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const { locationRefreshError, retryLocationRefresh } = useActiveLocationRefresh(token, request, setRequest);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "empty" | "failed" | "unavailable">(invalid ? "unavailable" : "loading");
  const [loadError, setLoadError] = useState<string | null>(invalid ? "This tracking link has a missing or invalid request ID." : null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const freshRequest = useRef(false);
  const loadSequence = useRef(0);

  const route = useCustomerRoute(request);
  const extraWork = request?.mechanicDetails?.extraWork;
  const isClosed = request?.status === "completed" || request?.status === "cancelled";
  const canCompleteJob = request?.status === "service_finished";
  // Explicit links always verify ownership and identity against the API before rendering.
  const cacheKey = customerId && !requestId && !invalid ? `rapidassist.customerActiveJob.${customerId}` : null;

  useEffect(() => {
    if (!cacheKey) return;
    let active = true;
    void readCachedRequest(cacheKey, true).then((saved) => {
      if (active && saved && saved.userId === customerId && !freshRequest.current && isActiveCustomerRequest(saved)) {
        setRequest(saved);
      }
    });
    return () => { active = false; };
  }, [cacheKey, customerId]);

  useEffect(() => {
    if (!cacheKey || !request || !isActiveCustomerRequest(request)) return;
    void writeCachedRequest(cacheKey, request, true);
  }, [cacheKey, request]);

  const load = useCallback(async () => {
    if (!token || !customerId || invalid) return;
    const run = ++loadSequence.current;
    try {
      const selected = requestId
        ? verifiedCustomerRequest(await getRequest(token, requestId), requestId, customerId)
        : selectActiveCustomerRequest(await listMyRequests(token), customerId);
      if (run !== loadSequence.current) return;
      freshRequest.current = true;
      const unavailable = Boolean(requestId && !selected);
      setLoadState(unavailable ? "unavailable" : selected ? "loaded" : "empty");
      setLoadError(unavailable ? "This request is unavailable." : null);
      if (!selected && cacheKey) void removeCachedRequest(cacheKey);
      setRequest(selected);
    } catch (error) {
      if (run !== loadSequence.current) return;
      const failure = trackingLoadFailure(error, Boolean(requestId));
      setLoadState(failure.kind);
      setLoadError(failure.message);
      if (failure.kind === "unavailable") setRequest(null);
    } finally {
      if (run === loadSequence.current) setRetrying(false);
    }
  }, [cacheKey, customerId, invalid, requestId, token]);

  function retryTracking() {
    setRetrying(true);
    route.retry();
    void load();
  }

  async function onApproveExtraWork(approved: boolean) {
    if (!token || !request) return;
    try {
      const updated = await approveExtraWork(token, request.id, approved);
      loadSequence.current += 1;
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
      loadSequence.current += 1;
      setRequest(updated);
      setShowCancel(false);
      if (!requestId && navigation.isFocused()) {
        router.replace({ pathname: "/(user)/tracking", params: { requestId: request.id } });
      }
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
      const updated = await updateRequestStatus(
        token,
        request.id,
        "completed",
        "Customer confirmed service completion"
      );
      loadSequence.current += 1;
      setRequest(updated);
      if (!requestId && navigation.isFocused()) {
        router.replace({ pathname: "/(user)/tracking", params: { requestId: request.id } });
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to complete job");
    } finally {
      setUpdating(false);
    }
  }

  useFocusEffect(useCallback(() => {
    if (invalid) return;
    void load();
    const timer = setInterval(load, TRACKING_REFRESH_MS);
    return () => { clearInterval(timer); loadSequence.current += 1; };
  }, [invalid, load, revision]));

  async function retrySearch() {
    if (!token || !request) return;
    setUpdating(true);
    try {
      const updated = await retryDispatch(token, request.id);
      loadSequence.current += 1;
      setRequest(updated);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Unable to restart search.");
    } finally {
      setUpdating(false);
    }
  }

  const phone = request?.provider?.phone?.replace(/[^0-9+]/g, "");
  const mapCenter = route.provider ?? route.target;
  const pickupLabel = request?.category === "fuel_delivery" ? "Delivery"
    : request?.category === "mechanic" ? "Service location" : "Pickup";
  const targetLabel = route.toDestination ? "Drop-off" : pickupLabel;
  const isSearching = request?.status === "searching_provider";
  const unavailable = isSearching && request.dispatch?.state === "unavailable";
  const eta = request ? customerEta(request.status, route) : "—";
  const distance = route.loading ? "Calculating…" : route.distance === null ? "—"
    : `${route.approximate ? "About " : ""}${route.distance.toFixed(1)} km`;

  return (
    <CustomerScreen active="Activity" header={
      <AppHeader title="Live tracking" back right={
        <IconButton icon="time-outline" label="Request history" onPress={() => router.push("/(user)/history")} />
      } />
    }>
      {loadState === "failed" && loadError ? (
        <Surface>
          <NoticeBanner tone="warning" title={request ? "Tracking update unavailable" : "Tracking unavailable"} message={loadError} />
          <PrimaryButton title="Retry" icon="refresh" variant="outline" loading={retrying} onPress={retryTracking} />
        </Surface>
      ) : null}
      {request ? (
        <>
          <Surface style={styles.mapCard}>
            {mapCenter ? (
              <LocationMapPreview
                pickup={mapCenter}
                destination={route.provider ? route.target : null}
                route={route.route}
                pickupLabel={route.provider ? "Provider" : targetLabel}
                destinationLabel={targetLabel}
                title={route.stale ? "Last known provider location" : "Assistance map"}
                requiresGoogleMap={requiresGoogleMap(request.pickupLocation, request.destinationLocation)}
                interactive
              />
            ) : (
              <View style={[customerStyles.row, styles.mapEmpty]}>
                <IconTile icon="map-outline" />
                <Text style={styles.flexText}>Waiting for map location</Text>
              </View>
            )}
            <MetricStrip items={[
              { icon: "time-outline", label: route.toDestination ? "Drop-off ETA" : "Estimated arrival", value: eta },
              { icon: "navigate-outline", label: "Distance", value: distance }
            ]} />
          </Surface>

          <Surface>
            <View style={customerStyles.row}>
              <IconTile icon={getServiceIcon(request.category)} />
              <View style={styles.flex}>
                <SectionHeading>{getServiceTitle(request.category)}</SectionHeading>
                <Text style={customerStyles.muted}>Request #{request.id.slice(-6).toUpperCase()}</Text>
              </View>
            </View>
            <StatusBadge status={request.status} unavailable={unavailable} />
            <TrackingLocation icon="location-outline" label={pickupLabel}
              value={request.pickupLocation?.addressText
                || (hasOperationalCoordinates(request.pickupLocation) ? "Map location" : "Location unavailable")} />
            {request.destinationLocation?.addressText ? (
              <TrackingLocation icon="flag-outline" label="Drop-off" value={request.destinationLocation.addressText} />
            ) : null}
            {request.provider ? (
              <View style={styles.provider}>
                <IconTile icon="person-outline" />
                <View style={styles.flex}>
                  <Text style={styles.providerName}>{request.provider.name}</Text>
                  {request.provider.ratingCount > 0 ? (
                    <Text style={customerStyles.muted}>★ {request.provider.ratingAvg.toFixed(1)} ({request.provider.ratingCount} ratings)</Text>
                  ) : null}
                  <Text style={customerStyles.muted}>{providerLocationText(request)}</Text>
                </View>
              </View>
            ) : null}
            <View style={customerStyles.actions}>
              <PrimaryButton title="Call" icon="call-outline" variant="outline" style={customerStyles.action}
                disabled={!phone} onPress={() => {
                  if (!phone) return;
                  void Linking.openURL(`tel:${phone}`).catch(() => setError("This device couldn’t open the phone app."));
                }} />
              <PrimaryButton title="Message" icon="chatbubble-outline" variant="outline" style={customerStyles.action}
                disabled={!request.providerId} onPress={() => router.push({
                  pathname: "/(user)/customer/chat/[requestId]", params: { requestId: request.id }
                })} />
              <PrimaryButton title="Refresh GPS" icon="refresh" variant="outline" style={customerStyles.action}
                onPress={() => {
                  if (locationRefreshError) retryLocationRefresh();
                  route.retry();
                  void load();
                }} />
            </View>
            {!isClosed ? (
              <Text style={customerStyles.muted} accessibilityLiveRegion="polite">
                {connected ? "Live updates connected" : "Reconnecting live updates…"}
              </Text>
            ) : null}
            {request.review?.rating ? <ReviewSummary request={request} /> : null}
          </Surface>

          {isSearching ? (
            <Surface>
              <SectionHeading>{unavailable ? "No provider accepted" : "Provider search"}</SectionHeading>
              <Text style={customerStyles.muted}>
                {unavailable
                  ? "Retry using the same pickup and search area. To change the pickup, cancel and submit a new request."
                  : `Searching${request.dispatch?.radiusKm ? ` within ${request.dispatch.radiusKm} km` : ""} · ${request.dispatch?.attempts ?? 0} providers contacted.`}
              </Text>
              {unavailable || !request.dispatch ? (
                <PrimaryButton title="Retry Search" icon="refresh" style={customerStyles.primary} loading={updating}
                  onPress={retrySearch} />
              ) : null}
            </Surface>
          ) : null}

          {request.status === "provider_arrived" ? (
            <NoticeBanner tone="success" title="Your provider is here"
              message={`Meet ${request.provider?.name || "your provider"} at your vehicle.`} />
          ) : null}

          {locationRefreshError ? (
            <Surface>
              <NoticeBanner tone="warning" title="GPS unavailable" message={locationRefreshError} />
              <PrimaryButton title="Retry Location Fetch" icon="navigate" variant="outline" onPress={retryLocationRefresh} />
            </Surface>
          ) : null}

          {extraWork && request.status === "extra_work_requested" ? (
            <Surface>
              <SectionHeading>Additional work estimate</SectionHeading>
              <Text style={customerStyles.muted}>{extraWork.description || extraWork.partName || "Parts and labour"}</Text>
              <Text style={styles.metricValue}>{formatCurrency((extraWork.partPrice || 0) + (extraWork.laborCharge || 0))}</Text>
              <View style={customerStyles.actions}>
                <PrimaryButton title="Decline Extra Work" variant="outline" style={customerStyles.action}
                  onPress={() => onApproveExtraWork(false)} />
                <PrimaryButton title="Approve Estimate" variant="success" style={customerStyles.action}
                  onPress={() => onApproveExtraWork(true)} />
              </View>
            </Surface>
          ) : null}

          {canCompleteJob ? (
            <Surface>
              <SectionHeading>Confirm service completion</SectionHeading>
              <Text style={customerStyles.muted}>Check that the roadside service is finished before confirming.</Text>
              <PrimaryButton title="Confirm Job Complete & Release" icon="checkmark-circle" variant="success"
                loading={updating} onPress={onCompleteJob} />
            </Surface>
          ) : null}

          {token && request.status === "completed" && request.providerId && !request.review?.rating ? (
            <ReviewPromptCard token={token} request={request} onSubmitted={setRequest} />
          ) : null}
          {request.status === "completed" ? (
            <PrimaryButton title="View Invoice & Receipt" icon="receipt-outline" style={customerStyles.primary}
              onPress={() => router.push({
                pathname: "/(user)/customer/payment/[requestId]", params: { requestId: request.id }
              })} />
          ) : null}

          <Progress request={request} />

          {request.estimate ? (
            <SummaryCard title="Estimate details" items={request.estimate.lines.map((line) => ({
              label: line.label, value: formatCurrency(line.amount)
            }))} total={formatCurrency(request.estimate.total)} />
          ) : null}

          {error ? <NoticeBanner tone="danger" title="Request update" message={error} /> : null}

          {!isClosed ? (
            showCancel ? (
              <Surface>
                <SectionHeading>Cancel assistance?</SectionHeading>
                <Text style={customerStyles.muted}>Your provider will be notified.</Text>
                <Field label="Cancellation reason (optional)" icon="document-text"
                  placeholder="Add a reason" value={cancelReason} onChangeText={setCancelReason} />
                <View style={customerStyles.actions}>
                  <PrimaryButton title="Keep Request" variant="outline" style={customerStyles.action}
                    disabled={updating} onPress={() => setShowCancel(false)} />
                <PrimaryButton title="Confirm Cancel" variant="danger" style={styles.dangerAction}
                    loading={updating} onPress={onCancelRequest} />
                </View>
              </Surface>
            ) : (
              <PrimaryButton title="Cancel Assistance Request" icon="close-circle-outline" variant="outline"
                onPress={() => setShowCancel(true)} />
            )
          ) : null}
        </>
      ) : loadState !== "failed" && loadState !== "loaded" ? (
        <Surface>
          <IconTile icon="navigate-outline" />
          <SectionHeading>{trackingEmptyTitle(loadState)}</SectionHeading>
          {loadError ? <NoticeBanner tone="danger" title="Tracking unavailable" message={loadError} /> : null}
          {loadState === "empty" && !requestId ? (
            <PrimaryButton title="Request Help" style={customerStyles.primary}
              onPress={() => router.push("/(user)/request")} />
          ) : null}
        </Surface>
      ) : null}
    </CustomerScreen>
  );
}

function TrackingLocation({ icon, label, value }: {
  icon: "location-outline" | "flag-outline";
  label: string;
  value: string;
}) {
  return (
    <View style={styles.locationRow}>
      <Ionicons name={icon} size={18} color={customerColors.brand} />
      <Text style={styles.locationText}>
        <Text style={styles.locationLabel}>{label} · </Text>{value}
      </Text>
    </View>
  );
}

function Progress({ request }: { request: ServiceRequest }) {
  if (request.status === "cancelled") {
    return <Surface><SectionHeading>Request progress</SectionHeading><Text style={customerStyles.muted}>Request cancelled.</Text></Surface>;
  }

  const steps = serviceSteps[request.category];
  const current = steps.findIndex((item) => item.statuses.includes(request.status));

  return (
    <Surface>
      <SectionHeading>Request progress</SectionHeading>
      <View>
        {steps.map(({ label }, index) => {
          const currentStep = index === current && request.status !== "completed";
          const done = index < current || request.status === "completed";
          return (
            <View key={label} style={styles.step}>
              <View style={styles.stepTrack}>
                <View style={[styles.stepDot, (currentStep || done) && styles.stepActive]}>
                  {done ? <Ionicons name="checkmark" size={11} color={customerColors.surface} /> : null}
                </View>
                {index < steps.length - 1 ? <View style={[styles.stepLine, done && styles.stepLineDone]} /> : null}
              </View>
              <Text style={[styles.stepLabel, (currentStep || done) && styles.stepLabelActive]}>
                {label}{currentStep ? " · Current step" : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexText: { flex: 1, color: customerColors.inkMuted, fontSize: 14 },
  mapCard: { padding: 8, gap: 8 },
  mapEmpty: { backgroundColor: customerColors.brandSoft, padding: 12, borderRadius: 10 },
  metricValue: { color: customerColors.ink, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  provider: { flexDirection: "row", alignItems: "center", paddingTop: 10, gap: 9, borderTopColor: customerColors.border, borderTopWidth: 1 },
  providerName: { color: customerColors.ink, fontWeight: "700", fontSize: 15 },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  locationText: { flex: 1, color: customerColors.inkMuted, fontSize: 13, lineHeight: 19 },
  locationLabel: { color: customerColors.ink, fontWeight: "700" },
  dangerAction: { ...customerStyles.action, borderColor: customerColors.statusDanger },
  step: { flexDirection: "row", gap: 10, minHeight: 33 },
  stepTrack: { width: 17, alignItems: "center" },
  stepDot: {
    width: 16, height: 16, borderRadius: 8, borderColor: customerColors.border, borderWidth: 1,
    backgroundColor: customerColors.canvas, alignItems: "center", justifyContent: "center"
  },
  stepActive: { backgroundColor: customerColors.brand, borderColor: customerColors.brand },
  stepLine: { backgroundColor: customerColors.border, width: 1, flex: 1 },
  stepLineDone: { backgroundColor: customerColors.brand },
  stepLabel: { flex: 1, paddingBottom: 8, color: customerColors.inkMuted, fontSize: 13, lineHeight: 18 },
  stepLabelActive: { color: customerColors.ink, fontWeight: "700" }
});

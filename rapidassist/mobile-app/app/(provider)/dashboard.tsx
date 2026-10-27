import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { acceptRequest, declineRequest, getProviderEarnings, updateProviderAvailability } from "../../src/requests/requests.api";
import { getProviderServiceTitle, getRequestTitle, getServiceIcon } from "../../src/requests/serviceCatalog";
import type { ProviderEarnings } from "../../src/requests/requests.types";
import { AppShell, BottomNav, Card, IconBox, Metric, PrimaryButton, SectionTitle, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";
import { useDispatchUpdates, useOfferSeconds } from "../../src/requests/DispatchProvider";


export default function ProviderDashboard() {
  const { token, user } = useAuth();
  const { offers: requests, activeJob: activeRequest, online, setOnline, refresh, connected, error: dispatchError } = useDispatchUpdates();
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [loading, setLoading] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incoming = requests[0] || null;
  const seconds = useOfferSeconds(incoming?.dispatch?.expiresAt);
  const serviceLabel = useMemo(() => getProviderServiceTitle(user?.mechanicProfile?.serviceCategory), [user]);

  async function loadRequests() {
    if (!token) return;
    try {
      await refresh();
      setEarnings(await getProviderEarnings(token));
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to refresh dashboard."); }
  }

  async function onDecline() {
    if (!token || !incoming?.dispatch?.offerId) return;
    try {
      setLoading(true);
      await declineRequest(token, incoming.id, incoming.dispatch.offerId);
      await refresh();
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to decline offer."); }
    finally { setLoading(false); }
  }

  async function onAccept() {
    if (!token || !incoming) return;
    try {
      setLoading(true);
      const accepted = await acceptRequest(token, incoming.id, incoming.dispatch?.offerId);
      await refresh();
      router.push({
        pathname: "/(provider)/jobs",
        params: { requestId: accepted.id, category: accepted.category }
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to accept request");
    } finally {
      setLoading(false);
    }
  }

  async function getAvailabilityLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let addressText = "Provider live location";

        try {
          const [address] = await Location.reverseGeocodeAsync({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude
          });
          const readable = address
            ? [address.name, address.street, address.city, address.region].filter(Boolean).join(", ")
            : "";
          if (readable) addressText = readable;
        } catch {
          addressText = "Provider live location";
        }

        return {
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          addressText
        };
      }
    } catch {
      // Fall back to the signup location below.
    }

    throw new Error("Location permission is required to go online.");
  }

  async function toggleOnline() {
    const next = !online;
    const previous = online;
    setOnline(next);
    if (!token) return;
    try {
      setAvailabilityStatus(next ? "Updating your live location..." : "Going offline...");
      const location = next ? await getAvailabilityLocation() : null;
      await updateProviderAvailability(token, next, location);
      setAvailabilityStatus(next ? "Online with live location." : "Offline.");
      await refresh();
    } catch (e: any) {
      setOnline(previous);
      setError(e?.response?.data?.message || e?.message || "Failed to update availability");
      setAvailabilityStatus(null);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [token, online]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell
        title={`Hello, ${user?.name || "Provider"}`}
        subtitle={serviceLabel}
        right={
          <Pressable accessibilityRole="switch" accessibilityLabel="Available for jobs" accessibilityState={{ checked: online }} hitSlop={8} onPress={toggleOnline} style={[styles.toggle, online ? styles.toggleOn : null]}>
            <View style={[styles.toggleDot, online ? styles.toggleDotOn : null]} />
          </Pressable>
        }
      >
        <Card style={styles.hero}>
          <View style={{ flex: 1 }}>
            <StatusPill label={online ? "Online" : "Offline"} tone={online ? "success" : "danger"} />
            <Text style={styles.heroTitle}>{online ? "You are receiving jobs" : "Go online to receive jobs"}</Text>
            <Text style={styles.heroText}>Only {serviceLabel} requests are shown for your provider account.</Text>
            {availabilityStatus ? <Text style={styles.availabilityText}>{availabilityStatus}</Text> : null}
          </View>
          <View style={styles.heroIcon}><Ionicons name="construct" size={42} color="white" /></View>
        </Card>

        <View style={styles.metrics}>
          <Metric label="Open jobs" value={String(requests.length)} icon="briefcase" />
          <Metric label="Today earning" value={`PKR ${earnings?.today?.toLocaleString() || 0}`} icon="wallet" />
          <Metric label="Rating" value={user?.ratingCount ? `${Number(user.ratingAvg || 0).toFixed(1)} (${user.ratingCount})` : "New"} icon="star" />
        </View>

        {activeRequest ? (
          <>
            <SectionTitle title="Active job" action={activeRequest.status.replaceAll("_", " ")} />
            <Card style={styles.job}>
              <View style={styles.jobTop}>
                <IconBox icon={getServiceIcon(activeRequest.category)} tone="success" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobTitle}>{getRequestTitle(activeRequest.category)}</Text>
                  <Text style={styles.jobMeta}>{activeRequest.pickupLocation?.addressText || "Pickup location"}</Text>
                </View>
                <StatusPill label={`PKR ${activeRequest.estimate?.total?.toLocaleString() || 0}`} tone="success" />
              </View>
              <PrimaryButton
                title="Continue Job"
                icon="navigate"
                variant="success"
                onPress={() =>
                  router.push({
                    pathname: "/(provider)/jobs",
                    params: { requestId: activeRequest.id, category: activeRequest.category }
                  })
                }
              />
            </Card>
          </>
        ) : null}

        <SectionTitle title="Your dispatch offer" action={incoming ? `${seconds}s remaining` : connected ? "Live" : "Refreshing"} />
        <Card style={styles.job}>
          <View style={styles.jobTop}>
            <IconBox icon={getServiceIcon(incoming?.category)} />
            <View style={{ flex: 1 }}>
              <Text style={styles.jobTitle}>{getRequestTitle(incoming?.category)}</Text>
              <Text style={styles.jobMeta}>
                {incoming
                  ? `${incoming.pickupLocation?.addressText || "Pickup location"} - PKR ${incoming.estimate?.total?.toLocaleString() || 0}`
                  : online
                    ? "No open request for your service right now."
                    : "You are offline."}
              </Text>
            </View>
            {incoming ? <StatusPill label={incoming.status.replaceAll("_", " ")} tone="warning" /> : null}
          </View>
          {error || dispatchError ? <Text style={styles.error}>{error || dispatchError}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton title={incoming ? "Decline" : "Refresh"} disabled={loading} variant="outline" style={{ flex: 1 }} onPress={incoming ? onDecline : loadRequests} />
            <PrimaryButton
              title="Details"
              icon="reader"
              variant="outline"
              disabled={!incoming}
              style={{ flex: 1 }}
              onPress={() => {
                if (!incoming) return;
                router.push({ pathname: "/(provider)/requests/[requestId]", params: { requestId: incoming.id } });
              }}
            />
            <PrimaryButton title={loading ? "Accepting..." : "Accept"} icon="checkmark" variant="success" disabled={!incoming || loading || seconds === 0} style={{ flex: 1 }} onPress={onAccept} />
          </View>
        </Card>

        <SectionTitle title="Verification" />
        <Card style={styles.verify}>
          <IconBox icon="shield-checkmark" tone={user?.verificationStatus === "verified" ? "success" : "warning"} />
          <View style={{ flex: 1 }}>
            <Text style={styles.verifyTitle}>{user?.verificationStatus === "verified" ? "Verified provider" : "Verification pending"}</Text>
            <Text style={styles.verifyText}>Complete verification to receive jobs matching your service.</Text>
          </View>
        </Card>
      </AppShell>
      <BottomNav role="provider" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { width: 58, height: 34, borderRadius: 17, backgroundColor: ui.colors.border, padding: 4, justifyContent: "center" },
  toggleOn: { backgroundColor: ui.colors.successSoft },
  toggleDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: ui.colors.muted },
  toggleDotOn: { marginLeft: 24, backgroundColor: ui.colors.success },
  hero: { backgroundColor: ui.colors.dark, borderColor: ui.colors.dark, flexDirection: "row", alignItems: "center", gap: 12 },
  heroTitle: { marginTop: 12, color: "white", fontSize: 22, lineHeight: 28, fontWeight: "900" },
  heroText: { marginTop: 8, color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  availabilityText: { marginTop: 8, color: "rgba(255,255,255,0.86)", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  heroIcon: { width: 82, height: 82, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  metrics: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  job: { gap: 14 },
  jobTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  jobTitle: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  jobMeta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10 },
  verify: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 12 },
  verifyTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  verifyText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});

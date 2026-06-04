import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { acceptRequest, getProviderActiveRequest, getProviderEarnings, listOpenRequests, updateProviderAvailability } from "../../src/requests/requests.api";
import { getProviderServiceTitle, getRequestTitle, getServiceIcon } from "../../src/requests/serviceCatalog";
import type { ProviderEarnings, ServiceRequest } from "../../src/requests/requests.types";
import { AppShell, BottomNav, Card, IconBox, Metric, PrimaryButton, SectionTitle, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

export default function ProviderDashboard() {
  const { token, user } = useAuth();
  const [online, setOnline] = useState(true);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incoming = requests[0] || null;
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const serviceLabel = useMemo(() => getProviderServiceTitle(user?.mechanicProfile?.serviceCategory), [user]);

  async function loadRequests(includeOpen = online) {
    if (!token) return;
    try {
      setError(null);
      const [open, active, providerEarnings] = await Promise.all([
        includeOpen ? listOpenRequests(token) : Promise.resolve([]),
        getProviderActiveRequest(token),
        getProviderEarnings(token)
      ]);
      setRequests(open);
      setActiveRequest(active);
      setEarnings(providerEarnings);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load requests");
    }
  }

  async function onAccept() {
    if (!token || !incoming) return;
    try {
      setLoading(true);
      const accepted = await acceptRequest(token, incoming.id);
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

  async function toggleOnline() {
    const next = !online;
    setOnline(next);
    if (!token) return;
    try {
      await updateProviderAvailability(token, next, {
        lat: 31.5204,
        lng: 74.3587,
        addressText: "Lahore"
      });
      if (next) loadRequests(true);
      else setRequests([]);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to update availability");
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
          <Pressable onPress={toggleOnline} style={[styles.toggle, online ? styles.toggleOn : null]}>
            <View style={[styles.toggleDot, online ? styles.toggleDotOn : null]} />
          </Pressable>
        }
      >
        <Card style={styles.hero}>
          <View style={{ flex: 1 }}>
            <StatusPill label={online ? "Online" : "Offline"} tone={online ? "success" : "danger"} />
            <Text style={styles.heroTitle}>{online ? "You are receiving jobs" : "Go online to receive jobs"}</Text>
            <Text style={styles.heroText}>Only {serviceLabel} requests are shown for your provider account.</Text>
          </View>
          <View style={styles.heroIcon}><Ionicons name="construct" size={42} color="white" /></View>
        </Card>

        <View style={styles.metrics}>
          <Metric label="Open jobs" value={String(requests.length)} icon="briefcase" />
          <Metric label="Today earning" value={`PKR ${earnings?.today?.toLocaleString() || 0}`} icon="wallet" />
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

        <SectionTitle title="Incoming request" action={incoming ? "New" : "None"} />
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton title="Refresh" variant="outline" style={{ flex: 1 }} onPress={loadRequests} />
            <PrimaryButton title={loading ? "Accepting..." : "Accept"} icon="checkmark" variant="success" disabled={!incoming || loading} style={{ flex: 1 }} onPress={onAccept} />
          </View>
        </Card>

        <SectionTitle title="Verification" />
        <Card style={styles.verify}>
          <IconBox icon="shield-checkmark" tone={user?.verificationStatus === "verified" ? "success" : "warning"} />
          <View style={{ flex: 1 }}>
            <Text style={styles.verifyTitle}>{user?.verificationStatus === "verified" ? "Verified provider" : "Verification pending"}</Text>
            <Text style={styles.verifyText}>Only verified service-category providers should receive production jobs.</Text>
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
  heroIcon: { width: 82, height: 82, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  metrics: { marginTop: 12, flexDirection: "row", gap: 12 },
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

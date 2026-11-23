import { customerRoutes } from "../../../src/navigation/routes";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { formatCurrency } from "../../../src/i18n";
import { useNotifications } from "../../../src/notifications/NotificationProvider";
import { useDispatchUpdates } from "../../../src/requests/DispatchProvider";
import { listMyRequests } from "../../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import { customerEta, useCustomerRoute } from "../../../src/requests/useCustomerRoute";
import type { RequestCategory, ServiceRequest } from "../../../src/requests/requests.types";
import { onReconnected } from "../../../src/services/networkManager";
import { NoticeBanner } from "../../../src/ui/components";
import {
  AppHeader, CustomerScreen, IconButton, IconTile, MetricStrip, PrimaryButton, SectionHeading, ServiceCard, StatusBadge, Surface,
  customerColors, customerStyles
} from "../../../src/ui/customer/components";
import { customerServices } from "../../../src/ui/customer/services";

function openRequest(category?: RequestCategory) {
  router.push(customerRoutes.newRequest(category ?? "car_towing"));
}

export default function UserHome() {
  const { token, user } = useAuth();
  const { unread } = useNotifications();
  const { revision } = useDispatchUpdates();
  const [snapshot, setSnapshot] = useState<{ token: string; request: ServiceRequest | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = token && snapshot?.token === token ? snapshot.request : null;
  const route = useCustomerRoute(activeRequest);

  useFocusEffect(useCallback(() => {
    if (!token) return;
    let active = true;
    let sequence = 0;
    async function load() {
      if (!token) return;
      const run = ++sequence;
      try {
        const requests = await listMyRequests(token);
        if (!active || run !== sequence) return;
        setSnapshot({
          token,
          request: requests.find((item) => item.status !== "completed" && item.status !== "cancelled") ?? null
        });
        setError(null);
      } catch {
        if (active && run === sequence) setError("We couldn't refresh your requests. Try again when connected.");
      }
    }

    void load();
    const unsubscribe = onReconnected(load);
    return () => { active = false; unsubscribe(); };
  }, [token, revision]));

  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <CustomerScreen active="Home" header={
      <AppHeader title="RapidAssist" brand right={
        <IconButton icon="notifications-outline" label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          unread={unread} onPress={() => router.push("/notifications")} />
      } />
    }>
      <View style={styles.greeting}>
        <Text accessibilityRole="header" style={styles.title}>{firstName ? `Hi, ${firstName}` : "Hello"}</Text>
        <Text style={customerStyles.muted}>How can we help you today?</Text>
      </View>

      <Surface style={styles.banner}>
        <View style={styles.bannerHeading}>
          <IconTile icon="help-buoy-outline" solid />
          <View style={styles.bannerCopy}>
            <SectionHeading>Need roadside help?</SectionHeading>
            <Text style={customerStyles.muted}>Find assistance at your location.</Text>
          </View>
        </View>
        <PrimaryButton title="Request Help" icon="arrow-forward" style={customerStyles.primary}
          onPress={() => openRequest()} />
      </Surface>

      {error ? <NoticeBanner tone="warning" title="Request updates" message={error} /> : null}

      <View style={styles.section}>
        <SectionHeading>Roadside services</SectionHeading>
        <View style={styles.serviceRow}>
          {customerServices.map(({ value, label }) => (
            <ServiceCard key={value} icon={getServiceIcon(value)} title={label} onPress={() => openRequest(value)} />
          ))}
        </View>
      </View>

      {activeRequest ? (
        <View style={styles.section}>
          <SectionHeading>Active assistance</SectionHeading>
          <Surface>
            <View style={customerStyles.row}>
              <IconTile icon={getServiceIcon(activeRequest.category)} />
              <View style={styles.activeCopy}>
                <Text style={styles.activeTitle}>{getServiceTitle(activeRequest.category)}</Text>
                {activeRequest.pickupLocation?.addressText ? (
                  <Text style={customerStyles.muted} numberOfLines={2}>{activeRequest.pickupLocation.addressText}</Text>
                ) : null}
              </View>
            </View>
            <StatusBadge status={activeRequest.status} unavailable={activeRequest.dispatch?.state === "unavailable"} />
            <MetricStrip items={[
              {
                icon: "time-outline", label: route.toDestination ? "Drop-off ETA" : "Estimated arrival",
                value: customerEta(activeRequest.status, route)
              },
              {
                icon: "receipt-outline", label: "Estimate",
                value: formatCurrency(activeRequest.estimate.total)
              }
            ]} />
            <PrimaryButton title="Track Request" icon="navigate-outline" variant="outline" onPress={() => {
              router.push(customerRoutes.request(activeRequest.id));
            }} />
          </Surface>
        </View>
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  greeting: { gap: 3, paddingTop: 8, paddingBottom: 4 },
  title: { color: customerColors.ink, fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  banner: { backgroundColor: customerColors.brandSoft, padding: 15, gap: 12 },
  bannerHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  bannerCopy: { flex: 1, gap: 3 },
  section: { gap: 9 },
  serviceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  activeCopy: { flex: 1, gap: 2 },
  activeTitle: { color: customerColors.ink, fontSize: 16, fontWeight: "700" }
});

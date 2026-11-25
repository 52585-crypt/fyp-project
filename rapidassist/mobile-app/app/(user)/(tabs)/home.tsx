import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, View } from "react-native";
import { useAuth } from "../../../src/auth/AuthProvider";
import { MapCanvas } from "../../../src/components/maps/MapCanvas";
import {
  Avatar, Badge, Banner, BottomSheet, Icon, IconButton, MapPill, MapTopBar, MAP_TOP_BAR_HEIGHT, ServiceTile, SkeletonCard, Text
} from "../../../src/design/components";
import { tapFeedback } from "../../../src/design/haptics";
import { tokens } from "../../../src/design/tokens";
import { customerRoutes } from "../../../src/navigation/routes";
import { useNotifications } from "../../../src/notifications/NotificationProvider";
import { RequestCard } from "../../../src/requests/customer/RequestCard";
import { useHomeMap } from "../../../src/requests/customer/useHomeMap";
import { nearbyProviderMarkers } from "../../../src/requests/nearbyProviderMarkers";
import { useNearbyProviders } from "../../../src/requests/useNearbyProviders";
import { useMyRequests } from "../../../src/requests/useMyRequests";

const services = [
  { title: "Tow Truck", subtitle: "Vehicle towing", icon: "car-sport-outline", go: () => router.push(customerRoutes.newRequest("car_towing")) },
  { title: "Fuel", subtitle: "Delivered to you", icon: "water-outline", go: () => router.push(customerRoutes.newRequest("fuel_delivery")) },
  { title: "Mechanic", subtitle: "On-site repair", icon: "construct-outline", go: () => router.push(customerRoutes.newRequest("mechanic")) },
  { title: "Battery Jump", subtitle: "Dead battery", icon: "battery-charging-outline",
    go: () => router.push({ pathname: "/request/new/[service]", params: { service: "mechanic", issue: "battery" } }) },
  { title: "Tyre Change", subtitle: "Flat tyre", icon: "disc-outline",
    go: () => router.push({ pathname: "/request/new/[service]", params: { service: "mechanic", issue: "tyre" } }) }
] as const;

const ACTIVE_CARD_HEIGHT = tokens.sizes.avatarLarge * 2;
const ALL_SERVICES = ["mechanic", "car_towing", "fuel_delivery"] as const;

/** Map-first home: live map of where you are, services in a bottom sheet above the tab bar. */
export default function CustomerHome() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const mine = useMyRequests();
  const map = useHomeMap();
  const near = useNearbyProviders(ALL_SERVICES, map.position ? { lat: map.position.latitude, lng: map.position.longitude } : null, Boolean(map.position));
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const active = mine.active[0];
  const peek = tokens.sizes.sheetPeek + (active ? ACTIVE_CARD_HEIGHT : 0);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <MapCanvas accessibilityLabel="Map of your location" inset={{ top: MAP_TOP_BAR_HEIGHT, bottom: peek }}
        focus={map.focus} markers={map.position
          ? [...nearbyProviderMarkers(near.providers ?? []), { id: "me", kind: "user", coordinate: map.position }] : []} />

      <MapTopBar
        left={<Avatar name={user?.name ?? "You"} size={tokens.sizes.iconButton} />}
        center={<MapPill title={`Hi${firstName ? `, ${firstName}` : ""}`} subtitle="Roadside help, 24/7" />}
        right={<IconButton icon="notifications-outline" label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          badge={unread > 0} onPress={() => router.push(customerRoutes.notifications)} />} />

      <View pointerEvents="box-none" style={[styles.fab, { bottom: peek + tokens.space.md }]}>
        <IconButton icon="locate" label="Centre map on my location" disabled={map.locating} onPress={() => void map.locate()} />
      </View>

      <BottomSheet aboveTabBar peek={peek} accessibilityLabel="Services">
        {active ? (
          <View style={styles.gapSm}>
            <View style={styles.row}><Text variant="headline">Your request</Text><Badge label="Live" tone="primary" /></View>
            <RequestCard request={active} />
          </View>
        ) : mine.loading ? <SkeletonCard lines={1} /> : null}

        <View style={styles.gapSm}>
          <Text variant="title">Where do you need help?</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Help location: ${map.address ?? "current location"}. Recentre map`}
            onPress={() => { tapFeedback(); void map.locate(); }} style={styles.place}>
            <View style={styles.placeIcon}><Icon name="navigate" color="primary" size={tokens.sizes.iconSmall} /></View>
            <View style={styles.flex}>
              <Text variant="captionStrong" color="muted">YOUR LOCATION</Text>
              <Text variant="bodyStrong" numberOfLines={1}>
                {map.locating && !map.position ? "Finding you…" : map.address ?? (map.position ? "Current location" : "Location off")}
              </Text>
            </View>
            <Text variant="captionStrong" color="primary">Refresh</Text>
          </Pressable>
        </View>

        {mine.error ? <Banner tone="warning" message={mine.error} /> : null}
        {map.error && !map.position ? <Banner tone="warning" message="Turn on location so providers can find you. You can still set a pickup pin manually." /> : null}

        <View style={styles.grid}>
          {services.map((s) => <ServiceTile key={s.title} title={s.title} subtitle={s.subtitle} icon={s.icon} onPress={s.go} />)}
          <ServiceTile title="More" icon="ellipsis-horizontal" comingSoon />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surfaceAlt },
  flex: { flex: 1 },
  fab: { position: "absolute", right: tokens.space.lg },
  gapSm: { gap: tokens.space.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  place: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md, minHeight: tokens.sizes.input,
    borderRadius: tokens.radius.control, backgroundColor: tokens.color.cloud
  },
  placeIcon: {
    width: tokens.sizes.buttonSmall, height: tokens.sizes.buttonSmall, borderRadius: tokens.radius.control,
    alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.mist
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm }
});

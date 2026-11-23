import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAuth } from "../../../src/auth/AuthProvider";
import { Banner, HeroCard, IconButton, Screen, SectionHeader, ServiceTile, SkeletonCard, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { customerRoutes } from "../../../src/navigation/routes";
import { useNotifications } from "../../../src/notifications/NotificationProvider";
import { RequestCard } from "../../../src/requests/customer/RequestCard";
import { useMyRequests } from "../../../src/requests/useMyRequests";

const services = [
  { title: "Tow Truck", subtitle: "Vehicle towing", icon: "car-sport-outline", go: () => router.push(customerRoutes.newRequest("car_towing")) },
  { title: "Fuel Delivery", subtitle: "At your location", icon: "water-outline", go: () => router.push(customerRoutes.newRequest("fuel_delivery")) },
  { title: "Mechanic", subtitle: "On-demand", icon: "construct-outline", go: () => router.push(customerRoutes.newRequest("mechanic")) },
  { title: "Battery Jump", subtitle: "Start your vehicle", icon: "battery-charging-outline",
    go: () => router.push({ pathname: "/request/new/[service]", params: { service: "mechanic", issue: "battery" } }) },
  { title: "Tyre Change", subtitle: "Flat tyre help", icon: "disc-outline",
    go: () => router.push({ pathname: "/request/new/[service]", params: { service: "mechanic", issue: "tyre" } }) }
] as const;

export default function CustomerHome() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const mine = useMyRequests();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <Screen edges={["top", "left", "right"]} refreshing={mine.refreshing} onRefresh={mine.refresh}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="title">Hello{firstName ? `, ${firstName}` : ""} 👋</Text>
          <Text variant="bodySmall" color="muted">How can we help you today?</Text>
        </View>
        <IconButton icon="notifications-outline" label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          badge={unread > 0} onPress={() => router.push(customerRoutes.notifications)} />
      </View>

      <HeroCard title="Need Help for Your Vehicle?" subtitle="24/7 support • Fast • Reliable" art="car-sport"
        actionLabel="Get Help Now" onAction={() => router.push(customerRoutes.newRequest("car_towing"))} />

      {mine.error ? <Banner tone="warning" message={mine.error} /> : null}
      {mine.loading ? <SkeletonCard lines={1} /> : null}
      {mine.active.length ? (
        <>
          <SectionHeader title="Active request" badge="Live" />
          {mine.active.slice(0, 2).map((r) => <RequestCard key={r.id} request={r} />)}
        </>
      ) : null}

      <SectionHeader title="Our Services" />
      <View style={styles.grid}>
        {services.map((s) => <ServiceTile key={s.title} title={s.title} subtitle={s.subtitle} icon={s.icon} onPress={s.go} />)}
        <ServiceTile title="More" icon="ellipsis-horizontal" comingSoon />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, paddingTop: tokens.space.sm },
  flex: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm }
});

import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, Text } from "react-native";
import { DriverCard } from "../../components/DriverCard";
import { CustomButton } from "../../components/CustomButton";
import { demoProvider } from "../../services/dummyApi";
import { ScreenScaffold } from "../shared/ScreenScaffold";
import { appColors, radii } from "../../constants/theme";

export function LiveTrackingScreen() {
  return (
    <ScreenScaffold title="Live Tracking" subtitle="Your provider is on the way.">
      <TrackingStatusCard />
      <DriverCard driver={demoProvider} />
      <View style={styles.actions}>
        <CustomButton title="SOS" variant="danger" style={{ flex: 1 }} />
        <CustomButton title="Cancel Request" variant="outline" style={{ flex: 1 }} />
      </View>
    </ScreenScaffold>
  );
}

function TrackingStatusCard() {
  return (
    <View style={styles.trackingCard}>
      <View style={styles.routeHeader}>
        <View style={styles.routeIcon}>
          <Ionicons name="navigate" size={22} color="white" />
        </View>
        <View style={styles.routeCopy}>
          <Text style={styles.routeTitle}>Provider en route</Text>
          <Text style={styles.routeMeta}>Estimated arrival: 12 min</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Live</Text>
        </View>
      </View>
      <View style={styles.timeline}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.line} />
        <View style={styles.dot} />
      </View>
      <View style={styles.routeLabels}>
        <Text style={styles.label}>Pickup confirmed</Text>
        <Text style={styles.label}>Arriving at your location</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trackingCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.surface,
    padding: 14,
    gap: 16
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  routeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: appColors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  routeCopy: { flex: 1 },
  routeTitle: { color: appColors.text, fontSize: 16, fontWeight: "900" },
  routeMeta: { marginTop: 3, color: appColors.muted, fontSize: 12, fontWeight: "700" },
  badge: {
    borderRadius: 12,
    backgroundColor: appColors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgeText: { color: appColors.primary, fontSize: 12, fontWeight: "900" },
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: appColors.primary,
    backgroundColor: appColors.surface
  },
  dotActive: { backgroundColor: appColors.primary },
  line: { flex: 1, height: 3, backgroundColor: appColors.primarySoft },
  routeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16
  },
  label: { flex: 1, color: appColors.muted, fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10 }
});

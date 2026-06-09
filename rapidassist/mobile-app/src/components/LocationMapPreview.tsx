import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import type { Coordinate } from "../utils/distance";

type Props = {
  pickup: Coordinate;
  destination?: Coordinate | null;
  providers?: Array<{
    id: string;
    name: string;
    distanceKm?: number | null;
    location: Coordinate;
  }>;
  pickupLabel?: string;
  destinationLabel?: string;
  title?: string;
};

export function LocationMapPreview({
  pickup,
  destination,
  providers = [],
  pickupLabel = "Pickup",
  destinationLabel = "Destination",
  title = "Route preview is available on mobile."
}: Props) {
  return (
    <View style={styles.preview}>
      <Ionicons name="map" size={28} color={colors.primary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>
        {pickupLabel}: {formatCoordinate(pickup)}
        {destination ? `\n${destinationLabel}: ${formatCoordinate(destination)}` : ""}
        {providers.length ? `\n${providers.length} available provider${providers.length === 1 ? "" : "s"} nearby` : ""}
      </Text>
      {providers.slice(0, 3).map((provider) => (
        <Text key={provider.id} style={styles.providerText}>
          {provider.name} - {provider.distanceKm ?? "nearby"} km
        </Text>
      ))}
    </View>
  );
}

function formatCoordinate(coordinate: Coordinate) {
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

const styles = StyleSheet.create({
  preview: {
    minHeight: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  title: { marginTop: 10, color: colors.text, fontSize: 15, fontWeight: "900", textAlign: "center" },
  text: { marginTop: 8, color: colors.mutedText, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  providerText: { marginTop: 5, color: colors.primary, fontSize: 12, fontWeight: "800", textAlign: "center" }
});

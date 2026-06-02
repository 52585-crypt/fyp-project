import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { appColors, radii } from "../constants/theme";

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Props = {
  pickup?: Coordinate;
  destination?: Coordinate;
};

const defaultPickup = { latitude: 31.5204, longitude: 74.3587 };
const defaultDestination = { latitude: 31.535, longitude: 74.3201 };

export function MapViewComponent({ pickup = defaultPickup, destination = defaultDestination }: Props) {
  return (
    <View style={styles.wrap}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: pickup.latitude,
          longitude: pickup.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08
        }}
      >
        <Marker coordinate={pickup} pinColor={appColors.primary} />
        <Marker coordinate={destination} pinColor={appColors.danger} />
        <Polyline coordinates={[pickup, destination]} strokeColor={appColors.primary} strokeWidth={4} />
      </MapView>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>12 min away</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 210, borderRadius: radii.lg, overflow: "hidden", backgroundColor: appColors.surfaceMuted },
  map: { ...StyleSheet.absoluteFillObject },
  badge: { position: "absolute", right: 12, top: 12, borderRadius: 12, backgroundColor: appColors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  badgeText: { color: appColors.text, fontSize: 12, fontWeight: "900" }
});

import { tokens } from "../design/tokens";
import React from "react";
import { Platform, Text, View } from "react-native";
import Constants from "expo-constants";
import { LocationMapPreview as LegacyPreview } from "./LocationMapPreviewLegacy";
import { GoogleMapView } from "./GoogleMapView";
import type { MapPreviewProps } from "./LocationMapPreview.shared";

export function LocationMapPreview(props: MapPreviewProps) {
  const enabled = Platform.OS === "web" ? Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY?.trim()) : Platform.OS === "android" && Boolean(Constants.expoConfig?.extra?.googleMapsAndroidConfigured);
  if (!enabled && props.requiresGoogleMap) return <View style={{ padding: 16 }}><Text>Google Maps is required to display this location.</Text></View>;
  if (!enabled) return <LegacyPreview {...props} />;
  return <View style={{ flex: 1, minHeight: tokens.sizes.map, overflow: "hidden" }}><GoogleMapView {...props} /></View>;
}

import React, { useEffect, useRef } from "react";
import { BOOKING_MAP_CENTER, type GoogleMapProps } from "./GoogleMap.shared";
import { tokens } from "../design/tokens";

export function GoogleMapView({ pickup, destination, providers = [], route = [], pickupLabel = "Pickup", destinationLabel = "Destination", currentLocation, cameraFocus, onPress }: GoogleMapProps) {
  // Avoid loading native map views in existing builds that use the fallback map.
  const { default: MapView, Marker, Polyline, PROVIDER_GOOGLE } = require("react-native-maps") as typeof import("react-native-maps");
  const map = useRef<import("react-native-maps").default>(null);
  const points = [
    ...(pickup ? [pickup] : []),
    ...(destination ? [destination] : []),
    ...(route.length > 1 ? route : providers.map((provider) => provider.location))
  ];
  const initialCenter = pickup ?? destination ?? BOOKING_MAP_CENTER;
  const fit = () => {
    if (cameraFocus) {
      map.current?.animateToRegion({ ...cameraFocus.coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 700);
      return;
    }
    if (points.length > 1) map.current?.fitToCoordinates(points, { edgePadding: { top: 55, bottom: 55, left: 45, right: 45 }, animated: true });
    else map.current?.animateToRegion({ ...(points[0] ?? initialCenter), latitudeDelta: 0.04, longitudeDelta: 0.04 });
  };
  useEffect(() => {
    fit();
  }, [pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude, providers, route, cameraFocus?.requestId]);
  return <MapView ref={map} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={{ ...initialCenter, latitudeDelta: 0.04, longitudeDelta: 0.04 }} onMapReady={fit} onPress={onPress ? (event: import("react-native-maps").MapPressEvent) => onPress(event.nativeEvent.coordinate) : undefined}>
    {pickup ? <Marker coordinate={pickup} title={pickupLabel} pinColor="green" /> : null}
    {currentLocation ? <Marker coordinate={currentLocation} title="Your current location" pinColor="dodgerblue" /> : null}
    {destination ? <Marker coordinate={destination} title={destinationLabel} pinColor="red" /> : null}
    {providers.map((provider) => <Marker key={provider.id} coordinate={provider.location} title={provider.name} pinColor="blue" />)}
    {route.length > 1 ? <>
      <Polyline coordinates={route} strokeColor={tokens.color.surfaceGlass} strokeWidth={10} lineCap="round" lineJoin="round" />
      <Polyline coordinates={route} strokeColor={tokens.color.primary} strokeWidth={6} lineCap="round" lineJoin="round" />
    </> : null}
  </MapView>;
}

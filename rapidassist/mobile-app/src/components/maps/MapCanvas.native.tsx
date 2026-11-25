import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type MapViewType from "react-native-maps";
import type { Details, Region } from "react-native-maps";
import Svg, { Path } from "react-native-svg";
import { Icon } from "../../design/components/Icon";
import { tokens } from "../../design/tokens";
import { isGoogleMapConfigured } from "../../services/googleMapsAvailability";
import { BOOKING_MAP_CENTER } from "../GoogleMap.shared";
import { accuracyRadius, canvasPoints, MAP_CANVAS_EDGE, type MapCanvasMarker, type MapCanvasProps } from "./MapCanvas.types";
import { SERVICE_MARKERS } from "./serviceGlyphs";
import { TileCanvas } from "./TileCanvas";
import { useGlidingMarkers } from "./useGlidingMarkers";

const DELTA = 0.012;

/** Android: react-native-maps (Google) when a Maps key is configured, otherwise the OSM tile canvas. */
export function MapCanvas(props: MapCanvasProps) {
  return isGoogleMapConfigured() ? <GoogleCanvas {...props} /> : <TileCanvas {...props} />;
}

function GoogleCanvas({ markers = [], route = [], plannedRoute = [], focus, inset = { top: 0, bottom: 0 }, onCenterChange, onMarkerPress, initialCenter, accessibilityLabel, style, testID }: MapCanvasProps) {
  // Loaded lazily so builds that only use the tile canvas never touch the native map module.
  const { default: MapView, Circle, Marker, Polyline, PROVIDER_GOOGLE } = require("react-native-maps") as typeof import("react-native-maps");
  const map = useRef<MapViewType>(null);
  const start = initialCenter ?? markers[0]?.coordinate ?? BOOKING_MAP_CENTER;
  const contentKey = JSON.stringify(canvasPoints(markers, route));
  // Drawn positions glide between live updates; the camera still fits the real targets.
  const drawn = useGlidingMarkers(markers);

  const place = () => {
    if (focus) return map.current?.animateToRegion({ ...focus.coordinate, latitudeDelta: DELTA, longitudeDelta: DELTA }, tokens.motion.normal * 2);
    if (onCenterChange) return; // pin mode: only the user or an explicit focus moves the camera
    const points = canvasPoints(markers, route);
    if (points.length > 1) {
      map.current?.fitToCoordinates(points, {
        edgePadding: { top: inset.top + MAP_CANVAS_EDGE, bottom: inset.bottom + MAP_CANVAS_EDGE, left: MAP_CANVAS_EDGE, right: MAP_CANVAS_EDGE },
        animated: true
      });
    } else if (points[0]) {
      map.current?.animateToRegion({ ...points[0], latitudeDelta: DELTA, longitudeDelta: DELTA }, tokens.motion.normal * 2);
    }
  };
  useEffect(place, [contentKey, focus?.requestId, inset.top, inset.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.fill, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
      <MapView ref={map} provider={PROVIDER_GOOGLE} style={styles.fill} onMapReady={place}
        initialRegion={{ ...start, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        // Pin mode: no padding, so the map centre stays exactly under the fixed pin.
        mapPadding={onCenterChange ? undefined : { top: inset.top, bottom: inset.bottom, left: 0, right: 0 }}
        toolbarEnabled={false} showsCompass={false} showsMyLocationButton={false}
        onRegionChangeComplete={onCenterChange ? (region: Region, details?: Details) => {
          if (details?.isGesture) onCenterChange({ latitude: region.latitude, longitude: region.longitude });
        } : undefined}>
        {plannedRoute.length > 1 ? (
          <Polyline coordinates={plannedRoute} strokeColor={tokens.color.routePlanned} strokeWidth={5} lineCap="round" lineDashPattern={[2, 10]} />
        ) : null}
        {route.length > 1 ? (
          <>
            <Polyline coordinates={route} strokeColor={tokens.color.surface} strokeWidth={10} lineCap="round" lineJoin="round" />
            <Polyline coordinates={route} strokeColor={tokens.color.primary} strokeWidth={6} lineCap="round" lineJoin="round" />
          </>
        ) : null}
        {drawn.map((m) => {
          const radius = accuracyRadius(m);
          return radius ? (
            <Circle key={`accuracy:${m.id}`} center={m.coordinate} radius={radius} zIndex={0}
              fillColor={tokens.color.myLocationAccuracy} strokeColor={tokens.color.myLocationAccuracyEdge} strokeWidth={1} />
          ) : null;
        })}
        {drawn.map((m) => (
          <Marker key={m.id} coordinate={m.coordinate} title={onMarkerPress ? undefined : m.label} anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={m.kind === "provider"} onPress={onMarkerPress ? () => onMarkerPress(m.id) : undefined}>
            <MarkerDot marker={m} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

function MarkerDot({ marker: { kind, service } }: { marker: MapCanvasMarker }) {
  if (kind === "provider" && service) {
    const look = SERVICE_MARKERS[service];
    return (
      <View style={[styles.dot, styles.provider, { backgroundColor: look.fill }]}>
        <Svg width={tokens.sizes.mapMarkerGlyph} height={tokens.sizes.mapMarkerGlyph} viewBox="0 0 24 24" fill="none"
          stroke={look.glyph} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          {look.paths.map((d) => <Path key={d} d={d} />)}
        </Svg>
      </View>
    );
  }
  if (kind === "provider") {
    return <View style={[styles.dot, styles.provider]}><Icon name="car-sport" color="ink" size={tokens.sizes.iconSmall} /></View>;
  }
  if (kind === "user") return <View style={styles.halo}><View style={[styles.dot, styles.user]} /></View>;
  return <View style={[styles.dot, kind === "destination" ? styles.destination : styles.pickup]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dot: { borderColor: tokens.color.surface, alignItems: "center", justifyContent: "center", ...tokens.shadow.card },
  pickup: { width: tokens.sizes.mapMarker, height: tokens.sizes.mapMarker, borderRadius: tokens.sizes.mapMarker / 2, borderWidth: 4, backgroundColor: tokens.color.primary },
  destination: { width: tokens.sizes.mapMarker, height: tokens.sizes.mapMarker, borderRadius: tokens.sizes.mapMarker / 2, borderWidth: 4, backgroundColor: tokens.color.red },
  user: {
    width: tokens.sizes.mapMyLocation, height: tokens.sizes.mapMyLocation, borderRadius: tokens.sizes.mapMyLocation / 2,
    borderWidth: 3, backgroundColor: tokens.color.myLocation
  },
  halo: {
    width: tokens.sizes.mapMyLocation + tokens.space.lg, height: tokens.sizes.mapMyLocation + tokens.space.lg,
    borderRadius: (tokens.sizes.mapMyLocation + tokens.space.lg) / 2, alignItems: "center", justifyContent: "center",
    backgroundColor: tokens.color.myLocationHalo
  },
  provider: {
    width: tokens.sizes.mapMarkerProvider, height: tokens.sizes.mapMarkerProvider, borderRadius: tokens.sizes.mapMarkerProvider / 2,
    borderWidth: 3, backgroundColor: tokens.color.amber
  }
});

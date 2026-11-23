import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  type CameraRef,
  type InitialViewState,
  GeoJSONSource,
  Layer,
  Map,
  Marker
} from "@maplibre/maplibre-react-native";
import { MapStatusOverlay } from "./MapStatusOverlay";
import {
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  OPENFREEMAP_LIBERTY_STYLE,
  fromLngLat,
  resolveMapCamera,
  routeFeatureCollection,
  toLngLat,
  validMarkers,
  type RapidAssistMapProps,
  type RapidAssistMapStatus
} from "./RapidAssistMap.types";
import { tokens } from "../../design/tokens";

const LOAD_TIMEOUT_MS = 20_000;
const DEFAULT_ROUTE_COLOR = tokens.color.primary;
const DEFAULT_ROUTE_WIDTH = 5;
const MAP_LOAD_ERROR = "Unable to load OpenFreeMap. Check your connection and try again.";

export function RapidAssistMap({
  markers = [],
  route,
  camera,
  mapStyle = OPENFREEMAP_LIBERTY_STYLE,
  style,
  onMapPress,
  onMarkerPress,
  onLoad,
  onError,
  onFallback,
  testID = "rapidassist-map"
}: RapidAssistMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const callbacksRef = useRef({ onMapPress, onMarkerPress, onLoad, onError });
  callbacksRef.current = { onMapPress, onMarkerPress, onLoad, onError };
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const failedRevisionRef = useRef<number | null>(null);
  const [status, setStatus] = useState<RapidAssistMapStatus>({ state: "loading" });
  const safeMarkers = useMemo(() => validMarkers(markers), [markers]);
  const routeData = useMemo(() => routeFeatureCollection(route), [route]);
  const resolvedCamera = useMemo(() => resolveMapCamera(camera, safeMarkers, route), [camera, route, safeMarkers]);
  const routeColor = typeof route?.color === "string" && route.color.trim()
    ? route.color
    : DEFAULT_ROUTE_COLOR;
  const routeWidth = typeof route?.width === "number" && Number.isFinite(route.width) && route.width > 0
    ? route.width
    : DEFAULT_ROUTE_WIDTH;

  const fail = useCallback((message = MAP_LOAD_ERROR, failedRevision = revisionRef.current) => {
    if (failedRevision !== revisionRef.current || failedRevisionRef.current === failedRevision) return;
    failedRevisionRef.current = failedRevision;
    setStatus({ state: "error", message });
    callbacksRef.current.onError?.(message);
  }, []);

  const retry = useCallback(() => {
    failedRevisionRef.current = null;
    setStatus({ state: "loading" });
    setRevision((value) => value + 1);
  }, []);

  const handleLoadStart = useCallback(() => {
    failedRevisionRef.current = null;
    setStatus({ state: "loading" });
  }, []);

  const handleLoadSuccess = useCallback(() => {
    failedRevisionRef.current = null;
    setStatus({ state: "ready" });
    callbacksRef.current.onLoad?.();
  }, []);

  const handleMapPress = useCallback((event: Parameters<NonNullable<React.ComponentProps<typeof Map>["onPress"]>>[0]) => {
    callbacksRef.current.onMapPress?.(fromLngLat(event.nativeEvent.lngLat));
  }, []);

  useEffect(() => {
    if (status.state !== "loading") return;
    const loadingRevision = revision;
    const timer = setTimeout(() => fail("The map took too long to load.", loadingRevision), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fail, revision, status.state]);

  useEffect(() => {
    if (status.state !== "ready" || !cameraRef.current) return;
    try {
      if (resolvedCamera.bounds) {
        cameraRef.current.fitBounds(resolvedCamera.bounds, {
          padding: resolvedCamera.padding,
          duration: resolvedCamera.durationMs,
          easing: "ease"
        });
      } else {
        cameraRef.current.easeTo({
          center: resolvedCamera.center,
          zoom: resolvedCamera.zoom,
          padding: resolvedCamera.padding,
          duration: resolvedCamera.durationMs,
          easing: "ease"
        });
      }
    } catch {
      fail("The map loaded, but its camera could not be positioned.");
    }
  }, [fail, resolvedCamera, status.state]);

  const initialViewState = useMemo<InitialViewState>(() => resolvedCamera.bounds
    ? { bounds: resolvedCamera.bounds, padding: resolvedCamera.padding }
    : { center: resolvedCamera.center, zoom: resolvedCamera.zoom, padding: resolvedCamera.padding }, [resolvedCamera]);

  return (
    <View style={[styles.root, style]} testID={testID}>
      <Map
        key={revision}
        testID={`${testID}-native`}
        mapStyle={mapStyle}
        style={StyleSheet.absoluteFill}
        dragPan
        touchZoom
        doubleTapZoom
        doubleTapHoldZoom
        touchRotate
        touchPitch={false}
        attribution
        attributionPosition={{ bottom: 4, right: 4 }}
        logo={false}
        compass
        compassPosition={{ top: 10, right: 10 }}
        onPress={handleMapPress}
        onWillStartLoadingMap={handleLoadStart}
        onDidFinishLoadingMap={handleLoadSuccess}
        onDidFailLoadingMap={() => fail()}
      >
        <Camera
          ref={cameraRef}
          testID={`${testID}-camera`}
          initialViewState={initialViewState}
          minZoom={MIN_MAP_ZOOM}
          maxZoom={MAX_MAP_ZOOM}
        />
        {routeData.features.length ? (
          <GeoJSONSource id="rapidassist-route-source" data={routeData}>
            <Layer
              id="rapidassist-route-line"
              type="line"
              paint={{
                "line-color": routeColor,
                "line-width": routeWidth,
                "line-opacity": 0.9
              }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </GeoJSONSource>
        ) : null}
        {safeMarkers.map((marker) => (
          <Marker
            key={marker.id}
            id={marker.id}
            testID={`${testID}-marker-${marker.id}`}
            lngLat={toLngLat(marker.coordinate)}
            anchor="bottom"
            accessible
            accessibilityRole="button"
            accessibilityLabel={marker.title || marker.label || "Map marker"}
            onPress={(event) => {
              event.stopPropagation();
              callbacksRef.current.onMarkerPress?.(marker);
            }}
          >
            <View style={styles.markerWrap}>
              <View style={[styles.marker, { backgroundColor: marker.color || DEFAULT_ROUTE_COLOR }]}>
                <Text style={styles.markerText}>{(marker.label || "•").slice(0, 2).toUpperCase()}</Text>
              </View>
              {marker.title ? <Text numberOfLines={1} style={styles.markerLabel}>{marker.title}</Text> : null}
            </View>
          </Marker>
        ))}
      </Map>
      <MapStatusOverlay status={status} onRetry={retry} onFallback={onFallback} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 240, overflow: "hidden", backgroundColor: tokens.color.surfaceAlt },
  markerWrap: { alignItems: "center", maxWidth: 150 },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5
  },
  markerText: { color: tokens.color.onPrimary, fontSize: tokens.size.caption, fontFamily: tokens.font.bold },
  markerLabel: {
    marginTop: 3,
    maxWidth: 140,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: tokens.color.surfaceGlass,
    color: tokens.color.text,
    fontSize: tokens.size.micro,
    fontFamily: tokens.font.bold
  }
});

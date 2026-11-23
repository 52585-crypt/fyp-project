import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapOptions,
  type Subscription
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapStatusOverlay } from "./MapStatusOverlay";
import {
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  OPENFREEMAP_LIBERTY_STYLE,
  OPENSTREETMAP_ATTRIBUTION,
  fromLngLat,
  resolveMapCamera,
  routeFeatureCollection,
  validMarkers,
  type RapidAssistMapMarker,
  type RapidAssistMapProps,
  type RapidAssistMapStatus
} from "./RapidAssistMap.types";

const ROUTE_SOURCE_ID = "rapidassist-route-source";
const ROUTE_LAYER_ID = "rapidassist-route-line";
const DEFAULT_ROUTE_COLOR = "#087f5b";
const DEFAULT_ROUTE_WIDTH = 5;
const LOAD_TIMEOUT_MS = 20_000;
const MAP_LOAD_ERROR = "Unable to load OpenFreeMap. Check your connection and try again.";
const MAPLIBRE_WORKER_URL = "https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl-worker.mjs";

// Metro emits a classic production bundle, while MapLibre 6 ships as ESM and
// resolves its module worker relative to import.meta.url. Use the matching,
// immutable worker asset explicitly so Expo Web can keep its classic bundle.
setWorkerUrl(MAPLIBRE_WORKER_URL);

type WebMarkerHandle = {
  marker: MapLibreMarker;
  remove: () => void;
};

type CurrentCallbacks = Pick<RapidAssistMapProps, "onMapPress" | "onMarkerPress" | "onLoad" | "onError">;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<WebMarkerHandle[]>([]);
  const callbacksRef = useRef<CurrentCallbacks>({ onMapPress, onMarkerPress, onLoad, onError });
  callbacksRef.current = { onMapPress, onMarkerPress, onLoad, onError };
  const failedAttemptRef = useRef<string | null>(null);
  const [revision, setRevision] = useState(0);
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

  const retry = useCallback(() => {
    failedAttemptRef.current = null;
    setStatus({ state: "loading" });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const attemptKey = `${revision}:${mapStyle}`;
    let active = true;
    let didLoad = false;
    let didFail = false;
    let map: MapLibreMap | null = null;
    let timeout: number | null = null;
    let subscriptions: Subscription[] = [];
    let resizeObserver: ResizeObserver | null = null;

    const reportFailure = (message: string) => {
      if (!active || didFail || failedAttemptRef.current === attemptKey) return;
      didFail = true;
      failedAttemptRef.current = attemptKey;
      if (timeout !== null) window.clearTimeout(timeout);
      setStatus({ state: "error", message });
      callbacksRef.current.onError?.(message);
    };

    setStatus({ state: "loading" });

    try {
      const initialBounds = resolvedCamera.bounds
        ? [
            [resolvedCamera.bounds[0], resolvedCamera.bounds[1]],
            [resolvedCamera.bounds[2], resolvedCamera.bounds[3]]
          ] as [[number, number], [number, number]]
        : null;
      const options: MapOptions = {
        container,
        style: mapStyle,
        minZoom: MIN_MAP_ZOOM,
        maxZoom: MAX_MAP_ZOOM,
        attributionControl: {
          compact: true,
          customAttribution: `<a href="${OPENSTREETMAP_ATTRIBUTION.url}" target="_blank" rel="noopener noreferrer">${OPENSTREETMAP_ATTRIBUTION.text}</a>`
        },
        dragPan: true,
        scrollZoom: true,
        boxZoom: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
        keyboard: true,
        trackResize: false,
        ...(initialBounds
          ? {
              bounds: initialBounds,
              fitBoundsOptions: { padding: resolvedCamera.padding, duration: 0 }
            }
          : { center: resolvedCamera.center, zoom: resolvedCamera.zoom })
      };
      map = new MapLibreMap(options);
      mapRef.current = map;
    } catch (cause) {
      reportFailure(errorMessage(cause, "MapLibre could not start in this browser."));
      return () => {
        active = false;
      };
    }

    const currentMap = map;
    const onMapClick = (event: MapMouseEvent) => {
      callbacksRef.current.onMapPress?.(fromLngLat([event.lngLat.lng, event.lngLat.lat]));
    };
    const onMapLoad = () => {
      if (!active || didLoad || didFail) return;
      try {
        if (!currentMap.getSource(ROUTE_SOURCE_ID)) {
          currentMap.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: routeData });
        }
        if (!currentMap.getLayer(ROUTE_LAYER_ID)) {
          currentMap.addLayer({
            id: ROUTE_LAYER_ID,
            source: ROUTE_SOURCE_ID,
            type: "line",
            paint: {
              "line-color": routeColor,
              "line-width": routeWidth,
              "line-opacity": 0.9
            },
            layout: { "line-cap": "round", "line-join": "round" }
          });
        }
      } catch (cause) {
        reportFailure(errorMessage(cause, "The map style loaded, but the route layer could not be prepared."));
        return;
      }
      didLoad = true;
      failedAttemptRef.current = null;
      if (timeout !== null) window.clearTimeout(timeout);
      setStatus({ state: "ready" });
      callbacksRef.current.onLoad?.();
    };
    const onMapError = (event: { error?: { message?: string } }) => {
      if (!didLoad) reportFailure(event.error?.message || MAP_LOAD_ERROR);
    };
    const resize = () => {
      if (active && mapRef.current === currentMap) currentMap.resize();
    };

    subscriptions = [
      currentMap.on("click", onMapClick),
      currentMap.on("load", onMapLoad),
      currentMap.on("error", onMapError)
    ];
    timeout = window.setTimeout(() => reportFailure("The map took too long to load."), LOAD_TIMEOUT_MS);
    resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(container);
    window.addEventListener("resize", resize);

    return () => {
      active = false;
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      removeWebMarkers(markerRefs.current);
      currentMap.remove();
      if (mapRef.current === currentMap) mapRef.current = null;
    };
  }, [mapStyle, revision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status.state !== "ready") return;
    try {
      if (resolvedCamera.bounds) {
        map.fitBounds(
          [
            [resolvedCamera.bounds[0], resolvedCamera.bounds[1]],
            [resolvedCamera.bounds[2], resolvedCamera.bounds[3]]
          ],
          { padding: resolvedCamera.padding, duration: resolvedCamera.durationMs }
        );
      } else {
        map.easeTo({
          center: resolvedCamera.center,
          zoom: resolvedCamera.zoom,
          padding: resolvedCamera.padding,
          duration: resolvedCamera.durationMs
        });
      }
    } catch (cause) {
      const message = errorMessage(cause, "The map loaded, but its camera could not be positioned.");
      setStatus({ state: "error", message });
      callbacksRef.current.onError?.(message);
    }
  }, [resolvedCamera, status.state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status.state !== "ready") return;
    removeWebMarkers(markerRefs.current);
    markerRefs.current = safeMarkers.map((marker) => createWebMarker(map, marker, callbacksRef));
    return () => removeWebMarkers(markerRefs.current);
  }, [safeMarkers, status.state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status.state !== "ready") return;
    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(routeData);
    if (map.getLayer(ROUTE_LAYER_ID)) {
      map.setPaintProperty(ROUTE_LAYER_ID, "line-color", routeColor);
      map.setPaintProperty(ROUTE_LAYER_ID, "line-width", routeWidth);
    }
  }, [routeColor, routeData, routeWidth, status.state]);

  return (
    <View style={[styles.root, style]} testID={testID}>
      <div ref={containerRef} data-testid={`${testID}-canvas`} style={webStyles.map} />
      <MapStatusOverlay status={status} onRetry={retry} onFallback={onFallback} />
    </View>
  );
}

function createWebMarker(
  map: MapLibreMap,
  marker: RapidAssistMapMarker,
  callbacksRef: React.MutableRefObject<CurrentCallbacks>
): WebMarkerHandle {
  const element = document.createElement("button");
  const accessibleName = marker.title || marker.label || "Map marker";
  element.type = "button";
  element.title = accessibleName;
  element.setAttribute("aria-label", accessibleName);
  element.textContent = (marker.label || "•").slice(0, 2).toUpperCase();
  Object.assign(element.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "34px",
    height: "34px",
    padding: "0",
    borderRadius: "50%",
    border: "3px solid white",
    background: marker.color || DEFAULT_ROUTE_COLOR,
    color: "white",
    fontSize: "12px",
    fontWeight: "900",
    lineHeight: "1",
    boxShadow: "0 3px 9px rgba(15, 23, 42, 0.35)",
    cursor: "pointer"
  });
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    callbacksRef.current.onMarkerPress?.(marker);
  };
  element.addEventListener("click", handleClick);
  const mapMarker = new MapLibreMarker({ element, anchor: "bottom" })
    .setLngLat([marker.coordinate.longitude, marker.coordinate.latitude])
    .addTo(map);
  return {
    marker: mapMarker,
    remove: () => {
      element.removeEventListener("click", handleClick);
      mapMarker.remove();
    }
  };
}

function removeWebMarkers(markers: WebMarkerHandle[]) {
  markers.splice(0).forEach((marker) => marker.remove());
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    width: "100%",
    minHeight: 240,
    overflow: "hidden",
    backgroundColor: "#edf4f0"
  }
});

const webStyles = {
  map: { position: "absolute", inset: 0, width: "100%", height: "100%" } as React.CSSProperties
};

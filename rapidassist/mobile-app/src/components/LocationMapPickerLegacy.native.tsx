import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors } from "../theme/colors";
import { isValidCoordinates, type Coordinate } from "../utils/distance";
import { TargetSwitch, type LocationTarget } from "./LocationMapPicker.shared";
import { BOOKING_MAP_CENTER, selectedCoordinateText, type MapProvider, type PickerProps } from "./GoogleMap.shared";
import { LEGACY_MAP_TILES } from "./maps/legacyMapTiles";

const INITIAL_ZOOM = 13;
const MIN_ZOOM = 10;
const MAX_ZOOM = 18;

type MapPayload = {
  pickup: Coordinate | null;
  destination: Coordinate | null;
  route: Coordinate[];
  providers: MapProvider[];
  activeTarget: LocationTarget;
  zoom: number;
  tileUrl: string;
  tileQuery: string;
  tileAttribution: string;
  singlePoint: boolean;
  pointLabel: string;
  pickupLabel: string;
  destinationLabel: string;
  selectedProviderId: string | null;
  currentLocation: Coordinate | null;
  center: Coordinate | null;
  initialCenter?: Coordinate;
  fitRoute: boolean;
};

type ParsedMapMessage =
  | { type: "mapPress"; target: LocationTarget; coordinate: Coordinate }
  | { type: "providerPress"; providerId: string }
  | { type: "coordinateError" };

function validProviderId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function serializeMapPayload(payload: MapPayload) {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function parseMapMessage(raw: unknown, providerIds: ReadonlySet<string>): ParsedMapMessage | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 1024) return null;
  try {
    const message = JSON.parse(raw) as Record<string, unknown>;
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    if (message.type === "providerPress") {
      return validProviderId(message.providerId) && providerIds.has(message.providerId)
        ? { type: "providerPress", providerId: message.providerId }
        : null;
    }
    if (message.type === "mapPress") {
      const target = message.target;
      const coordinate = { latitude: message.latitude, longitude: message.longitude };
      if (target !== "pickup" && target !== "destination") return null;
      return isValidCoordinates(coordinate)
        ? { type: "mapPress", target, coordinate }
        : { type: "coordinateError" };
    }
  } catch {
    return null;
  }
  return null;
}

export function LocationMapPicker({
  pickup,
  destination,
  route = [],
  providers = [],
  activeTarget,
  onActiveTargetChange,
  onPickupChange,
  onDestinationChange,
  singlePoint,
  pointLabel = "Service location",
  pickupLabel = "Pickup",
  destinationLabel = "Destination",
  selectedProviderId = null,
  onProviderPress,
  onCoordinateError,
  currentLocation = null,
  cameraFocus = null,
  onRequestCurrentLocation,
  mapHeight
}: PickerProps) {
  const [fullMapVisible, setFullMapVisible] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [mapCenter, setMapCenter] = useState<Coordinate | null>(null);
  const [resolvedCurrentLocation, setResolvedCurrentLocation] = useState<Coordinate | null>(currentLocation);
  const [recenterVersion, setRecenterVersion] = useState(0);
  const [recentering, setRecentering] = useState(false);
  const [fitRoute, setFitRoute] = useState(true);
  const validRoute = useMemo(
    () => route.length > 1 && route.every(isValidCoordinates) ? route : [],
    [route]
  );
  const routeSignature = validRoute.length > 1
    ? `${validRoute.length}:${validRoute[0].latitude},${validRoute[0].longitude}:${validRoute[validRoute.length - 1].latitude},${validRoute[validRoute.length - 1].longitude}`
    : "none";
  const providerIds = useMemo(
    () => new Set(providers.filter((provider) => validProviderId(provider.id) && isValidCoordinates(provider.location)).map((provider) => provider.id)),
    [providers]
  );
  const html = useMemo(
    () => buildMapHtml({
      pickup,
      destination,
      route: validRoute,
      providers,
      activeTarget,
      zoom,
      singlePoint: Boolean(singlePoint),
      pointLabel,
      pickupLabel,
      destinationLabel,
      selectedProviderId,
      currentLocation: resolvedCurrentLocation,
      center: mapCenter,
      fitRoute
    }),
    [activeTarget, destination, destinationLabel, fitRoute, mapCenter, pickup, pickupLabel, pointLabel, providers, resolvedCurrentLocation, routeSignature, selectedProviderId, singlePoint, zoom]
  );

  useEffect(() => {
    if (validRoute.length > 1) setFitRoute(true);
  }, [routeSignature]);

  useEffect(() => {
    if (isValidCoordinates(currentLocation)) setResolvedCurrentLocation(currentLocation);
  }, [currentLocation?.latitude, currentLocation?.longitude]);

  useEffect(() => {
    if (!cameraFocus || !isValidCoordinates(cameraFocus.coordinate)) return;
    setMapCenter(cameraFocus.coordinate);
    setRecenterVersion((value) => value + 1);
  }, [cameraFocus?.requestId]);

  useEffect(() => {
    if (!cameraFocus) setMapCenter(null);
  }, [pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude, cameraFocus]);

  function updateZoom(delta: number) {
    setFitRoute(false);
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
  }

  function onMessage(event: WebViewMessageEvent) {
    const message = parseMapMessage(event.nativeEvent.data, providerIds);
    if (!message) return;
    if (message.type === "coordinateError") {
      onCoordinateError?.("The map returned invalid coordinates. Please tap the map again.");
      return;
    }
    if (message.type === "providerPress") {
      onProviderPress?.(message.providerId);
      return;
    }
    if (message.target !== activeTarget) return;
    if (singlePoint || activeTarget === "pickup") onPickupChange(message.coordinate);
    else onDestinationChange(message.coordinate);
  }

  async function recenterOnCurrentLocation() {
    if (recentering) return;
    setRecentering(true);
    try {
      const requested = await onRequestCurrentLocation?.();
      if (isValidCoordinates(requested)) {
        setResolvedCurrentLocation(requested);
        setMapCenter(requested);
        setRecenterVersion((value) => value + 1);
      }
    } finally {
      setRecentering(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {singlePoint ? null : <TargetSwitch activeTarget={activeTarget} onActiveTargetChange={onActiveTargetChange} />}
      <View style={[styles.mapWrap, mapHeight ? { height: mapHeight } : null]}>
        <MapWebView html={html} activeTarget={activeTarget} pickup={pickup} destination={destination} center={mapCenter} zoom={zoom} routeSignature={routeSignature} recenterVersion={recenterVersion} onMessage={onMessage} />
        <View pointerEvents="none" style={styles.hint}>
          <Text style={styles.hintText}>
            OpenStreetMap - tap to set {singlePoint ? pointLabel.toLowerCase() : activeTarget === "pickup" ? "pickup" : "destination"}
          </Text>
        </View>
        <Pressable onPress={() => setFullMapVisible(true)} style={styles.expandButton}>
          <Ionicons name="expand" size={17} color={colors.primary} />
          <Text style={styles.expandText}>Full map</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Recenter map on current location" disabled={recentering} onPress={recenterOnCurrentLocation} style={[styles.recenterButton, recentering ? styles.recenterButtonDisabled : null]}>
          <Ionicons name="locate" size={20} color={colors.primary} />
        </Pressable>
        <ZoomControls zoom={zoom} onZoomIn={() => updateZoom(1)} onZoomOut={() => updateZoom(-1)} />
      </View>
      <View style={styles.coordinateChips}>
        <CoordinateChip label={singlePoint ? pointLabel : pickupLabel} coordinate={pickup} tone="pickup" />
        {singlePoint ? null : <CoordinateChip label={destinationLabel} coordinate={destination} tone="destination" />}
      </View>
      <Modal visible={fullMapVisible} animationType="slide" onRequestClose={() => setFullMapVisible(false)}>
        <SafeAreaView style={styles.fullScreen}>
          <View style={styles.fullHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fullTitle}>Pick Location</Text>
              <Text style={styles.fullSubtitle}>
                {singlePoint ? "Tap the map to set the service location." : "Select pickup or destination, then tap the map."}
              </Text>
            </View>
            <Pressable onPress={() => setFullMapVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          {singlePoint ? null : (
            <View style={styles.fullSwitch}>
              <TargetSwitch activeTarget={activeTarget} onActiveTargetChange={onActiveTargetChange} />
            </View>
          )}
          <View style={styles.fullMap}>
            <MapWebView html={html} activeTarget={activeTarget} pickup={pickup} destination={destination} center={mapCenter} zoom={zoom} routeSignature={routeSignature} recenterVersion={recenterVersion} onMessage={onMessage} />
            <View pointerEvents="none" style={styles.fullHint}>
              <Text style={styles.hintText}>
                Tap map to set {singlePoint ? pointLabel.toLowerCase() : activeTarget === "pickup" ? "pickup" : "destination"}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Recenter map on current location" disabled={recentering} onPress={recenterOnCurrentLocation} style={[styles.recenterButton, styles.recenterButtonFull, recentering ? styles.recenterButtonDisabled : null]}>
              <Ionicons name="locate" size={20} color={colors.primary} />
            </Pressable>
            <ZoomControls zoom={zoom} onZoomIn={() => updateZoom(1)} onZoomOut={() => updateZoom(-1)} fullScreen />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function CoordinateChip({
  label,
  coordinate,
  tone
}: {
  label: string;
  coordinate: Coordinate | null;
  tone: "pickup" | "destination";
}) {
  return (
    <View style={styles.coordinateChip}>
      <View style={[styles.coordinateDot, tone === "destination" ? styles.destinationDot : styles.pickupDot]} />
      <Text style={styles.coordinateText}>
        {label}: {selectedCoordinateText(coordinate)}
      </Text>
    </View>
  );
}

function MapWebView({
  html,
  activeTarget,
  pickup,
  destination,
  center,
  zoom,
  routeSignature,
  recenterVersion,
  onMessage
}: {
  html: string;
  activeTarget: LocationTarget;
  pickup: Coordinate | null;
  destination: Coordinate | null;
  center: Coordinate | null;
  zoom: number;
  routeSignature: string;
  recenterVersion: number;
  onMessage: (event: WebViewMessageEvent) => void;
}) {
  return (
    <WebView
      key={`${activeTarget}-${zoom}-${pickup?.latitude}-${pickup?.longitude}-${destination?.latitude}-${destination?.longitude}-${routeSignature}-${center?.latitude ?? "auto"}-${center?.longitude ?? "auto"}-${recenterVersion}`}
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      onMessage={onMessage}
      style={styles.webView}
    />
  );
}

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  fullScreen
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  fullScreen?: boolean;
}) {
  return (
    <View style={[styles.zoomControls, fullScreen ? styles.zoomControlsFull : null]}>
      <Pressable
        onPress={onZoomIn}
        disabled={zoom >= MAX_ZOOM}
        style={({ pressed }) => [styles.zoomButton, zoom >= MAX_ZOOM ? styles.zoomButtonDisabled : null, pressed ? styles.zoomButtonPressed : null]}
      >
        <Ionicons name="add" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.zoomDivider} />
      <Pressable
        onPress={onZoomOut}
        disabled={zoom <= MIN_ZOOM}
        style={({ pressed }) => [styles.zoomButton, zoom <= MIN_ZOOM ? styles.zoomButtonDisabled : null, pressed ? styles.zoomButtonPressed : null]}
      >
        <Ionicons name="remove" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

export function buildMapHtml({
  pickup,
  destination,
  route,
  providers,
  activeTarget,
  zoom,
  singlePoint,
  pointLabel,
  pickupLabel,
  destinationLabel,
  selectedProviderId,
  currentLocation,
  center,
  fitRoute
}: Omit<MapPayload, "tileUrl" | "tileQuery" | "tileAttribution">) {
  const safeProviders = providers.flatMap((provider) => validProviderId(provider.id) && isValidCoordinates(provider.location)
    ? [{
        id: provider.id,
        name: typeof provider.name === "string" ? provider.name.slice(0, 160) : "Provider",
        distanceKm: typeof provider.distanceKm === "number" && Number.isFinite(provider.distanceKm) ? provider.distanceKm : null,
        location: provider.location
      }]
    : []);
  const payload = serializeMapPayload({
    pickup,
    destination,
    route,
    providers: safeProviders,
    activeTarget,
    zoom,
    tileUrl: LEGACY_MAP_TILES.baseUrl,
    tileQuery: LEGACY_MAP_TILES.query,
    tileAttribution: LEGACY_MAP_TILES.attribution,
    singlePoint,
    pointLabel,
    pickupLabel,
    destinationLabel,
    selectedProviderId: safeProviders.some((provider) => provider.id === selectedProviderId) ? selectedProviderId : null,
    currentLocation: isValidCoordinates(currentLocation) ? currentLocation : null,
    center: isValidCoordinates(center) ? center : null,
    initialCenter: BOOKING_MAP_CENTER,
    fitRoute
  });

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #eef2f7;
        font-family: Arial, sans-serif;
        touch-action: manipulation;
      }
      .tile {
        position: absolute;
        width: 256px;
        height: 256px;
      }
      .marker {
        position: absolute;
        width: 34px;
        height: 34px;
        margin-left: -17px;
        margin-top: -17px;
        border-radius: 17px;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 10px rgba(15, 23, 42, 0.32);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 900;
        z-index: 8;
        pointer-events: none;
      }
      .pickup { background: #2563eb; }
      .destination { background: #dc2626; }
      .provider { background: #16a34a; font-size: 13px; }
      .provider { pointer-events: auto; cursor: pointer; }
      .provider.selected { border-color: #facc15; box-shadow: 0 0 0 4px rgba(250,204,21,0.35), 0 4px 10px rgba(15,23,42,0.32); transform: scale(1.12); }
      .current-location { width: 20px; height: 20px; margin-left: -10px; margin-top: -10px; background: #2563eb; border-width: 4px; }
      .label {
        position: absolute;
        transform: translate(-50%, 18px);
        z-index: 9;
        border-radius: 10px;
        background: rgba(255,255,255,0.96);
        padding: 4px 7px;
        color: #0f172a;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
        pointer-events: none;
      }
      .route-svg {
        position: absolute;
        inset: 0;
        z-index: 4;
        pointer-events: none;
      }
      .attribution {
        position: absolute;
        right: 8px;
        bottom: 8px;
        z-index: 6;
        border-radius: 9px;
        background: rgba(255,255,255,0.92);
        padding: 5px 8px;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      const data = ${payload};
      const tileSize = 256;
      const map = document.getElementById("map");

      function worldPoint(coordinate, scale) {
        const sinLat = Math.sin(coordinate.latitude * Math.PI / 180);
        return {
          x: ((coordinate.longitude + 180) / 360) * scale,
          y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
        };
      }

      function coordinateFromWorld(point, scale) {
        const longitude = (point.x / scale) * 360 - 180;
        const n = Math.PI - (2 * Math.PI * point.y) / scale;
        const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        return { latitude, longitude };
      }

      function draw() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const routePoints = data.route.length > 1 ? data.route : [];
        const points = routePoints.length
          ? [data.pickup, data.destination, ...routePoints]
          : data.singlePoint
            ? [data.pickup, ...data.providers.map((provider) => provider.location)]
            : [data.pickup, data.destination, ...data.providers.map((provider) => provider.location)];
        const validPoints = points.filter((point) => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
        const fitPoints = routePoints.length ? validPoints : [];
        const renderZoom = data.fitRoute && fitPoints.length ? fitZoom(fitPoints, width, height) : data.zoom;
        const scale = tileSize * Math.pow(2, renderZoom);
        const center = data.center || (validPoints.length ? boundsCenter(validPoints) : data.initialCenter);
        const centerPoint = worldPoint(center, scale);
        const topLeft = {
          x: centerPoint.x - width / 2,
          y: centerPoint.y - height / 2
        };
        const maxTile = Math.pow(2, renderZoom);

        map.innerHTML = "";

        const startX = Math.floor(topLeft.x / tileSize);
        const endX = Math.floor((topLeft.x + width) / tileSize);
        const startY = Math.floor(topLeft.y / tileSize);
        const endY = Math.floor((topLeft.y + height) / tileSize);

        for (let x = startX; x <= endX; x += 1) {
          for (let y = startY; y <= endY; y += 1) {
            if (y < 0 || y >= maxTile) continue;
            const urlX = ((x % maxTile) + maxTile) % maxTile;
            const img = document.createElement("img");
            img.className = "tile";
            const tileSrc = data.tileUrl + "/" + renderZoom + "/" + urlX + "/" + y + ".png" + data.tileQuery;
            let retries = 0;
            img.onerror = () => {
              if (retries >= 2) return;
              retries += 1;
              setTimeout(() => {
                img.src = tileSrc + (tileSrc.includes("?") ? "&" : "?") + "retry=" + retries;
              }, retries * 600);
            };
            img.src = tileSrc;
            img.style.left = (x * tileSize - topLeft.x) + "px";
            img.style.top = (y * tileSize - topLeft.y) + "px";
            map.appendChild(img);
          }
        }

        if (!data.singlePoint && routePoints.length) addRoute(routePoints, topLeft, scale, width, height);
        if (data.pickup) addMarker(toScreenPoint(data.pickup, topLeft, scale), "pickup", "P", data.singlePoint ? data.pointLabel : data.pickupLabel);
        if (!data.singlePoint && data.destination) addMarker(toScreenPoint(data.destination, topLeft, scale), "destination", "D", data.destinationLabel);
        if (data.currentLocation) {
          addMarker(toScreenPoint(data.currentLocation, topLeft, scale), "current-location", "", "You");
        }
        data.providers.forEach((provider) => {
          const providerPoint = toScreenPoint(provider.location, topLeft, scale);
          const distanceText = Number.isFinite(provider.distanceKm) ? " - " + provider.distanceKm + " km" : "";
          addMarker(providerPoint, "provider" + (provider.id === data.selectedProviderId ? " selected" : ""), "V", provider.name + distanceText, provider.id);
        });

        const attribution = document.createElement("div");
        attribution.className = "attribution";
        attribution.textContent = data.tileAttribution;
        map.appendChild(attribution);

        map.onclick = function(event) {
          const coordinate = coordinateFromWorld(
            { x: topLeft.x + event.clientX, y: topLeft.y + event.clientY },
            scale
          );
          if (!Number.isFinite(coordinate.latitude) || coordinate.latitude < -90 || coordinate.latitude > 90 ||
              !Number.isFinite(coordinate.longitude) || coordinate.longitude < -180 || coordinate.longitude > 180) {
            sendMessage({ type: "mapPress", target: data.activeTarget, latitude: null, longitude: null });
            return;
          }
          sendMessage({
            type: "mapPress",
            target: data.activeTarget,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
          });
        };
      }

      function toScreenPoint(coordinate, topLeft, scale) {
        const point = worldPoint(coordinate, scale);
        return { x: point.x - topLeft.x, y: point.y - topLeft.y };
      }

      function boundsCenter(coordinates) {
        const latitudes = coordinates.map((coordinate) => coordinate.latitude);
        const longitudes = coordinates.map((coordinate) => coordinate.longitude);
        return {
          latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
          longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2
        };
      }

      function fitZoom(coordinates, width, height) {
        const availableWidth = Math.max(1, width - 96);
        const availableHeight = Math.max(1, height - 96);
        for (let candidate = ${MAX_ZOOM}; candidate >= ${MIN_ZOOM}; candidate -= 1) {
          const candidateScale = tileSize * Math.pow(2, candidate);
          const projected = coordinates.map((coordinate) => worldPoint(coordinate, candidateScale));
          const xs = projected.map((point) => point.x);
          const ys = projected.map((point) => point.y);
          if (Math.max(...xs) - Math.min(...xs) <= availableWidth && Math.max(...ys) - Math.min(...ys) <= availableHeight) return candidate;
        }
        return ${MIN_ZOOM};
      }

      function sendMessage(message) {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      }

      function addMarker(point, className, text, labelText, providerId) {
        const marker = document.createElement("div");
        marker.className = "marker " + className;
        marker.textContent = text;
        marker.style.left = point.x + "px";
        marker.style.top = point.y + "px";
        map.appendChild(marker);

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = labelText;
        label.style.left = point.x + "px";
        label.style.top = point.y + "px";
        map.appendChild(label);
        if (providerId) {
          const selectProvider = function(event) {
            event.preventDefault();
            event.stopPropagation();
            sendMessage({ type: "providerPress", providerId: providerId });
          };
          marker.setAttribute("role", "button");
          marker.setAttribute("aria-label", "Select " + labelText);
          marker.addEventListener("click", selectProvider);
          label.style.pointerEvents = "auto";
          label.style.cursor = "pointer";
          label.addEventListener("click", selectProvider);
        }
      }

      function addRoute(coordinates, topLeft, scale, width, height) {
        const namespace = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(namespace, "svg");
        svg.setAttribute("class", "route-svg");
        svg.setAttribute("width", String(width));
        svg.setAttribute("height", String(height));
        const points = coordinates.map((coordinate) => {
          const point = toScreenPoint(coordinate, topLeft, scale);
          return point.x + "," + point.y;
        }).join(" ");
        [["#ffffff", "10"], ["#4f46e5", "6"]].forEach(([color, strokeWidth]) => {
          const line = document.createElementNS(namespace, "polyline");
          line.setAttribute("points", points);
          line.setAttribute("fill", "none");
          line.setAttribute("stroke", color);
          line.setAttribute("stroke-width", strokeWidth);
          line.setAttribute("stroke-linecap", "round");
          line.setAttribute("stroke-linejoin", "round");
          svg.appendChild(line);
        });
        map.appendChild(svg);
      }

      window.addEventListener("resize", draw);
      draw();
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  mapWrap: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted
  },
  webView: { flex: 1, backgroundColor: colors.surfaceMuted },
  coordinateChips: { gap: 7 },
  coordinateChip: {
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  coordinateDot: { width: 10, height: 10, borderRadius: 5 },
  pickupDot: { backgroundColor: colors.primary },
  destinationDot: { backgroundColor: colors.danger },
  coordinateText: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "800" },
  hint: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  hintText: { color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  expandButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    minHeight: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  expandText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  recenterButton: {
    position: "absolute",
    left: 12,
    bottom: 12,
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center"
  },
  recenterButtonFull: { bottom: 18 },
  recenterButtonDisabled: { opacity: 0.5 },
  zoomControls: {
    position: "absolute",
    right: 12,
    top: 64,
    width: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border
  },
  zoomControlsFull: { top: 62 },
  zoomButton: {
    width: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  zoomButtonPressed: { backgroundColor: colors.primarySoft },
  zoomButtonDisabled: { opacity: 0.4 },
  zoomDivider: { height: 1, backgroundColor: colors.border },
  fullScreen: { flex: 1, backgroundColor: colors.bg },
  fullHeader: {
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  fullTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  fullSubtitle: { marginTop: 3, color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  fullSwitch: { padding: 12, backgroundColor: colors.surface },
  fullMap: { flex: 1 },
  fullHint: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 9
  }
});
